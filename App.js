import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  StatusBar,
  View,
  ActivityIndicator,
  Animated,
  AppState,
  Platform,
  BackHandler,
  ToastAndroid,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import SplashScreen from './screens/auth/SplashScreen';
import LoginScreen from './screens/auth/LoginScreen';
import RegisterScreen from './screens/auth/RegisterScreen';
import StudentDashboardScreen from './screens/student/StudentDashboardScreen';
import BookRideScreen from './screens/student/BookRideScreen';
import TrackDriverScreen from './screens/student/TrackDriverScreen';
import OrderDetailsScreen from './screens/student/OrderDetailsScreen';
import BookingConfirmedScreen from './screens/student/BookingConfirmedScreen';
import MyOrdersScreen from './screens/student/MyOrdersScreen';
import DriverDashboardScreen from './screens/driver/DriverDashboardScreen';
import CurrentTripScreen from './screens/driver/CurrentTripScreen';
import MultiPassengerRideScreen from './screens/driver/MultiPassengerRideScreen';
import DriverCompletedRidesScreen from './screens/driver/DriverCompletedRidesScreen';
import DriverTripsScreen from './screens/driver/DriverTripsScreen';
import AdminDashboardScreen from './screens/admin/AdminDashboardScreen';
import MessagesScreen from './screens/shared/MessagesScreen';
import ProfileScreen from './screens/shared/ProfileScreen';
import SettingsScreen from './screens/shared/SettingsScreen';
import BlockedUsersScreen from './screens/shared/BlockedUsersScreen';
import MyReportsScreen from './screens/shared/MyReportsScreen';
import ReportDetailScreen from './screens/shared/ReportDetailScreen';
import NotificationsScreen from './screens/shared/NotificationsScreen';
import ReportUserScreen from './screens/shared/ReportUserScreen';
import BottomNavBar from './components/BottomNavBar';
import DialogHost from './components/DialogHost';
import ScreenFrame from './components/ScreenFrame';
import AppShell from './components/AppShell';
import InstallBanner from './components/InstallBanner';
import { isNavScreen, isRailVisible } from './lib/nav';
import { frameVariantForScreen } from './lib/webLayout';
import { COLORS } from './theme';
import { getCurrentSession, getCurrentProfile, signOut, setDriverOnlineStatus } from './data/auth';
import { supabase } from './config/supabase';
import { subscribeToAllUserMessages, getUnreadMessagesCount } from './data/messages';
import { getActiveTrip, clearActiveTrip } from './data/activeTripStore';
import { registerForPushNotifications, addNotificationReceivedListener, addNotificationResponseListener } from './data/pushNotifications';
import { getTripsByStudent } from './data/trips';
import { getActiveModeration } from './data/moderation';
import { alertDialog } from './lib/dialog';

const getDashboardForRole = (role) => {
  if (role === 'admin') return 'AdminDashboard';
  if (role === 'driver') return 'DriverDashboard';
  return 'StudentDashboard';
};

function AppRouter() {
  const [currentScreen, setCurrentScreen] = useState('Splash');
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [screenHistory, setScreenHistory] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [activeTripId, setActiveTripId] = useState(null);
  const [chatTripId, setChatTripId] = useState(null);
  const [isInChat, setIsInChat] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [driverOnline, setDriverOnline] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Measured here, not inside AppShell, because this same value decides
  // whether the phone BottomNavBar renders. One measurement, one predicate
  // (lib/nav.js isRailVisible), two consumers — so the rail and the tab bar
  // can never both be on screen. Unconditional on every platform; on native
  // isRailVisible returns false regardless of the width it is handed.
  const { width: windowWidth } = useWindowDimensions();
  const showRail = isRailVisible(currentScreen, isInChat, windowWidth, Platform.OS);
  const frameVariant = frameVariantForScreen(currentScreen, Boolean(userProfile));

  useEffect(() => {
    fadeAnim.setValue(0.55);
    slideAnim.setValue(4);
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [currentScreen]);

  const userProfileRef = useRef(userProfile);
  userProfileRef.current = userProfile;
  const currentScreenRef = useRef(currentScreen);
  currentScreenRef.current = currentScreen;

  // Check for existing session on mount
  useEffect(() => {
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        if (Platform.OS === 'web') {
          setCurrentScreen((prev) => (prev === 'Splash' ? 'Login' : prev));
        }
        setInitializing(false);
      }
    }, 15000);

    const restoreSession = async () => {
      try {
        const session = await getCurrentSession();
        if (session && isMounted) {
          const profile = await getCurrentProfile();
          if (profile && profile.status === 'approved' && isMounted) {
            setUserRole(profile.role);
            setUserProfile(profile);
            if (profile.role === 'driver') {
              setDriverOnline(true);
            }
            setCurrentScreen(getDashboardForRole(profile.role));
            clearTimeout(fallbackTimer);
            setInitializing(false);

            // Asynchronously restore active trips and push notifications without blocking initial render
            if (profile.role === 'driver') {
              getActiveTrip(profile.id)
                .then(async (stored) => {
                  if (stored && (stored.status === 'accepted' || stored.status === 'in_progress')) {
                    setActiveTripId(stored.id);
                  } else {
                    await clearActiveTrip().catch(() => {});
                  }
                })
                .catch(() => {});
            }

            if (profile.role === 'student') {
              getTripsByStudent(profile.id)
                .then((trips) => {
                  const activeStudentTrip = (trips || []).find(
                    (t) => t.status === 'pending' || t.status === 'accepted' || t.status === 'in_progress'
                  );
                  if (activeStudentTrip) {
                    setActiveTripId(activeStudentTrip.id);
                  }
                })
                .catch(() => {});
            }

            registerForPushNotifications(profile.id).catch(() => {});
            return;
          }
        }
      } catch (e) {
        // No valid session
      }

      if (isMounted) {
        clearTimeout(fallbackTimer);
        // On web, navigate straight to Login if not logged in to eliminate delay
        if (Platform.OS === 'web') {
          setCurrentScreen('Login');
        }
        setInitializing(false);
      }
    };

    restoreSession();
    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Listen for auth state changes (token refreshed, signed out, etc.)
  // Decoupled from currentScreen to avoid tearing down subscriptions on every navigation
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || !session) {
        if (userProfileRef.current) {
          setUserRole(null);
          setUserProfile(null);
          setScreenHistory([]);
          setDriverOnline(false);
          setCurrentScreen('Login');
        }
        return;
      }

      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        try {
          const profile = await getCurrentProfile();
          if (profile && profile.status === 'approved') {
            if (!userProfileRef.current || userProfileRef.current.id !== profile.id) {
              setUserRole(profile.role);
              setUserProfile(profile);
              if (profile.role === 'driver') {
                setDriverOnline(true);
              }
              if (currentScreenRef.current === 'Login' || currentScreenRef.current === 'Splash') {
                setCurrentScreen(getDashboardForRole(profile.role));
              }
              setInitializing(false);
            }
          }
        } catch (e) {
          console.warn('Auth state change profile fetch error:', e.message);
        }
      }

    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  const applyDriverOnline = (online) => {
    setDriverOnline(online);
    if (userProfile?.id) {
      setDriverOnlineStatus(userProfile.id, online).catch(() => {});
    }
  };

  // Auto online/offline for drivers: online while the app is open/foreground,
  // offline when it goes to the background or closes.
  useEffect(() => {
    if (!userProfile || userProfile.role !== 'driver') {
      setDriverOnline(false);
      return undefined;
    }
    applyDriverOnline(true);
    const sub = AppState.addEventListener('change', (nextState) => {
      const online = nextState === 'active';
      applyDriverOnline(online);
    });
    return () => sub.remove();
  }, [userProfile?.id, userProfile?.role]);

  // Real-time unread messages listener for notification badges
  useEffect(() => {
    if (!userProfile?.id) {
      setUnreadCount(0);
      return;
    }

    let isMounted = true;
    const fetchUnread = async () => {
      const count = await getUnreadMessagesCount(userProfile.id, userRole);
      if (isMounted) setUnreadCount(count);
    };

    fetchUnread();

    const unsub = subscribeToAllUserMessages(userProfile.id, () => {
      fetchUnread();
    });

    // 4-second polling fallback for instant badge updates on mobile
    const pollInterval = setInterval(fetchUnread, 4000);

    return () => {
      isMounted = false;
      unsub();
      clearInterval(pollInterval);
    };
  }, [userProfile?.id, userRole]);

  // Handle push notifications (foreground + background/opened)
  useEffect(() => {
    const receivedSub = addNotificationReceivedListener((notification) => {
      // Refresh unread counts when notification received
      if (userProfile?.id) {
        getUnreadMessagesCount(userProfile.id, userRole).then((count) => {
          setUnreadCount(count);
        }).catch(() => {});
      }
    });

    const responseSub = addNotificationResponseListener((response) => {
      try {
        const data = response?.notification?.request?.content?.data || {};
        if (data?.screen === 'Messages') {
          if (typeof data?.tripId === 'string') {
            setChatTripId(data.tripId);
          } else if (data?.tripId) {
            setChatTripId(data.tripId);
          }
          navigateTo('Messages');
        } else if (data?.screen === 'OrderDetails' || data?.screen === 'TrackDriver') {
          if (data?.tripId) {
            setActiveTripId(data.tripId);
          }
          navigateTo(data.screen);
        } else if (data?.screen === 'Notifications') {
          navigateTo('Notifications');
        }
      } catch (e) {}
    });

    return () => {
      try { receivedSub?.remove?.(); } catch (e) {}
      try { responseSub?.remove?.(); } catch (e) {}
    };
  }, [userProfile?.id, userRole]);

  // Refresh unread count when viewing or leaving messages
  useEffect(() => {
    if (userProfile?.id && currentScreen === 'Messages') {
      getUnreadMessagesCount(userProfile.id, userRole).then((count) => {
        setUnreadCount(count);
      });
    }
  }, [currentScreen, isInChat, userProfile?.id, userRole]);

  const navigateTo = (screen, params = null) => {
    if (screen === 'Home') {
      setCurrentScreen(getDashboardForRole(userRole));
      setScreenHistory([]);
      setChatTripId(null);
      return;
    }
    if (screen === 'Messages') {
      if (typeof params === 'string') {
        setChatTripId(params);
      } else if (params?.tripId) {
        setChatTripId(params.tripId);
      } else {
        setChatTripId(null);
      }
    } else {
      setChatTripId(null);
    }
    setScreenHistory((prev) => {
      if (prev.length > 0 && prev[prev.length - 1] === currentScreen) {
        return prev;
      }
      if (currentScreen === screen) {
        return prev;
      }
      return [...prev, currentScreen];
    });
    setCurrentScreen(screen);
  };

  const goBack = () => {
    if (screenHistory.length > 0) {
      const prev = screenHistory[screenHistory.length - 1];
      setScreenHistory((prevHistory) => prevHistory.slice(0, -1));
      setCurrentScreen(prev);
    } else {
      setCurrentScreen(getDashboardForRole(userRole));
    }
  };

  // Hardware Android back button handling
  const lastBackPressRef = useRef(0);
  const [reportContext, setReportContext] = useState(null);
  const [selectedReport, setSelectedReport] = useState(null);
  useEffect(() => {
    const handleHardwareBackPress = () => {
      // 1. If inside an open chat conversation, let MessagesScreen handle it
      if (currentScreen === 'Messages' && isInChat) {
        return false;
      }

      // 2. If on Register screen, navigate back to Login
      if (currentScreen === 'Register') {
        navigateTo('Login');
        return true;
      }

      // 3. If there is screen navigation history, go back to previous screen
      if (screenHistory.length > 0) {
        goBack();
        return true;
      }

      // 4. If on any sub-screen without prior history, navigate back to Home dashboard
      const isSubScreen = [
        'BookRide',
        'BookingConfirmed',
        'TrackDriver',
        'OrderDetails',
        'MyOrders',
        'Profile',
        'Settings',
        'DriverTrips',
        'CurrentTrip',
        'MultiPassengerRide',
        'DriverCompletedRides',
        'Messages',
        'BlockedUsers',
        'MyReports',
        'ReportDetail',
        'Notifications',
        'ReportUser',
      ].includes(currentScreen);

      if (isSubScreen && userRole) {
        navigateTo('Home');
        return true;
      }

      // 5. If on root screens (Dashboard or Login), require double-tap back to exit
      const isRootScreen = ['StudentDashboard', 'DriverDashboard', 'AdminDashboard', 'Login'].includes(currentScreen);
      if (isRootScreen) {
        const now = Date.now();
        if (now - lastBackPressRef.current < 2000) {
          BackHandler.exitApp();
          return true;
        }
        lastBackPressRef.current = now;
        if (Platform.OS === 'android') {
          ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
        }
        return true;
      }

      return false;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', handleHardwareBackPress);
    return () => backSub.remove();
  }, [currentScreen, screenHistory, userRole, isInChat]);

  const handleLoginSuccess = async (role, profile) => {
    if (profile?.id) {
      try {
        const mod = await getActiveModeration(profile.id);
        if (mod) {
          if (mod.action === 'ban') {
            await alertDialog({ title: 'Account Banned', message: mod.reason ? `Your account has been banned. Reason: ${mod.reason}` : 'Your account has been banned.' });
            await signOut().catch(() => {});
            setCurrentScreen('Login');
            return;
          }
          if (mod.action === 'suspend') {
            await alertDialog({ title: 'Account Suspended', message: mod.reason ? `Your account has been suspended. Reason: ${mod.reason}` : 'Your account has been suspended.' });
            await signOut().catch(() => {});
            setCurrentScreen('Login');
            return;
          }
        }
      } catch (e) {}
    }

    setUserRole(role);
    setUserProfile(profile);
    setScreenHistory([]);
    setDriverOnline(role === 'driver');
    if (role === 'driver' && profile?.id) {
      setDriverOnlineStatus(profile.id, true).catch(() => {});
    }
    // Register push notification token on login
    if (profile?.id) {
      registerForPushNotifications(profile.id).catch(() => {});
    }
    setCurrentScreen(getDashboardForRole(role));
  };

  const handleLogout = async () => {
    if (userProfile?.role === 'driver' && userProfile?.id) {
      setDriverOnlineStatus(userProfile.id, false).catch(() => {});
    }
    try {
      await signOut();
    } catch (e) {
      // Sign out even if Supabase call fails
    }
    setUserRole(null);
    setUserProfile(null);
    setScreenHistory([]);
    setDriverOnline(false);
    setCurrentScreen('Login');
  };

  // Show loading spinner while restoring session
  if (initializing) {
    return (
      <ScreenFrame>
        <SafeAreaProvider>
          <View style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
            <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
          </View>
        </SafeAreaProvider>
      </ScreenFrame>
    );
  }

  if (currentScreen === 'AdminDashboard') {
    // Gate on the live role. Without this, the screen can be re-entered with
    // no session: onBack pushed 'AdminDashboard' onto screenHistory, so the
    // hardware back button on Login popped straight back into it.
    if (userProfile?.role !== 'admin') {
      setUserRole(null);
      setUserProfile(null);
      setScreenHistory([]);
      setCurrentScreen('Login');
      return null;
    }

    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
          <AdminDashboardScreen
            userProfile={userProfile}
            onBack={() => {
              // Clear history so the back button cannot re-enter this screen.
              setScreenHistory([]);
              setCurrentScreen('Login');
            }}
            onLogout={handleLogout}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  // NOTE: the AdminDashboard branch above is deliberately NOT wrapped in
  // AppShell. It renders its own persistent 260px sidebar
  // (AdminDashboardScreen.js:41-53) and is a real wide layout, so centring it
  // in a 480px column — or adding a second rail beside its own — would break
  // it.
  return (
    <AppShell
      banner={<InstallBanner />}
      railActive={showRail}
      frameVariant={frameVariant}
      userRole={userRole}
      userProfile={userProfile}
      currentScreen={currentScreen}
      onNavigate={(target) => navigateTo(target)}
      onBookRide={() => navigateTo('BookRide')}
      unreadMessagesCount={unreadCount}
      onLogout={handleLogout}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                ...(Platform.OS === 'ios' ? { transform: [{ translateY: slideAnim }] } : {}),
              },
            ]}
          >
            {currentScreen === 'Splash' && (
              <SplashScreen onFinish={() => navigateTo('Login')} />
            )}
  
            {currentScreen === 'Login' && (
              <LoginScreen
                onLoginSuccess={handleLoginSuccess}
                onSignUp={() => navigateTo('Register')}
              />
            )}
  
            {currentScreen === 'Register' && (
              <RegisterScreen
                onLogin={() => navigateTo('Login')}
              />
            )}
  
            {currentScreen === 'StudentDashboard' && (
              <StudentDashboardScreen
                userProfile={userProfile}
                onNavigate={(target, params) => navigateTo(target, params)}
                onBookRide={() => navigateTo('BookRide')}
                activeTripId={activeTripId}
                onViewTrip={(tripId) => {
                  setActiveTripId(tripId);
                  navigateTo('OrderDetails');
                }}
                onCancelTrip={() => {
                  setActiveTripId(null);
                }}
              />
            )}
  
            {currentScreen === 'BookRide' && (
              <BookRideScreen
                userProfile={userProfile}
                onConfirmBooking={(tripId) => {
                  setActiveTripId(tripId);
                  navigateTo('BookingConfirmed');
                }}
                onNavigate={(target, params) => navigateTo(target, params)}
              />
            )}
  
            {currentScreen === 'BookingConfirmed' && (
              <BookingConfirmedScreen
                onContinue={() => navigateTo('Home')}
              />
            )}
  
            {currentScreen === 'TrackDriver' && (
              <TrackDriverScreen
                userProfile={userProfile}
                tripId={activeTripId}
                onCancelTrip={() => { setActiveTripId(null); navigateTo('StudentDashboard'); }}
                onNavigate={(target, params) => navigateTo(target, params)}
              />
            )}
  
            {currentScreen === 'OrderDetails' && (
              <OrderDetailsScreen
                userProfile={userProfile}
                tripId={activeTripId}
                onGoBack={() => navigateTo('StudentDashboard')}
                onNavigate={(target, params) => navigateTo(target, params)}
              />
            )}
  
            {currentScreen === 'MyOrders' && (
              <MyOrdersScreen
                userProfile={userProfile}
                onGoBack={() => navigateTo('StudentDashboard')}
                onNavigate={(target) => navigateTo(target)}
                onViewTrip={(tripId) => {
                  setActiveTripId(tripId);
                  navigateTo('OrderDetails');
                }}
              />
            )}
  
            {currentScreen === 'DriverDashboard' && (
              <DriverDashboardScreen
                userProfile={userProfile}
                activeTripId={activeTripId}
                isOnline={driverOnline}
                onAcceptRide={(tripId, options = {}) => {
                  setActiveTripId(tripId);
                  if (options?.openMulti) {
                    navigateTo('MultiPassengerRide');
                  } else {
                    navigateTo('CurrentTrip');
                  }
                }}
                onNavigate={(target) => navigateTo(target)}
              />
            )}
  
            {currentScreen === 'DriverCompletedRides' && (
              <DriverCompletedRidesScreen
                userProfile={userProfile}
                onBack={goBack}
              />
            )}
  
            {currentScreen === 'DriverTrips' && (
              <DriverTripsScreen
                userProfile={userProfile}
                activeTripId={activeTripId}
                onBack={goBack}
                onResumeTrip={(tripId) => {
                  setActiveTripId(tripId);
                  navigateTo('CurrentTrip');
                }}
              />
            )}
  
            {currentScreen === 'CurrentTrip' && (
              <CurrentTripScreen
                userProfile={userProfile}
                tripId={activeTripId}
                onTripCompleted={() => {
                  clearActiveTrip();
                  setActiveTripId(null);
                  navigateTo('DriverDashboard');
                }}
                onCancelTrip={() => {
                  clearActiveTrip();
                  setActiveTripId(null);
                  navigateTo('DriverDashboard');
                }}
                onNavigate={(target, params) => navigateTo(target, params)}
              />
            )}
  
            {currentScreen === 'MultiPassengerRide' && (
              <MultiPassengerRideScreen
                userProfile={userProfile}
                onBack={goBack}
                onAllCompleted={() => {
                  clearActiveTrip();
                  setActiveTripId(null);
                  // Home clears the navigation stack so hardware back cannot
                  // return to an empty multi-passenger screen.
                  navigateTo('Home');
                }}
                onNavigate={(target, params) => navigateTo(target, params)}
              />
            )}
  
            {currentScreen === 'Messages' && (
              <MessagesScreen
                userRole={userRole}
                userProfile={userProfile}
                tripId={chatTripId}
                onBack={() => {
                  setChatTripId(null);
                  goBack();
                }}
                onChatOpen={() => setIsInChat(true)}
                onChatClose={() => {
                  setIsInChat(false);
                  setChatTripId(null);
                }}
                onMessagesRead={() => {
                  if (userProfile?.id) {
                    getUnreadMessagesCount(userProfile.id, userRole).then((count) => {
                      setUnreadCount(count);
                    });
                  }
                }}
              />
            )}
  
            {currentScreen === 'Profile' && (
              <ProfileScreen
                userRole={userRole}
                userProfile={userProfile}
                onLogout={handleLogout}
                onBack={goBack}
                onNavigate={(target) => navigateTo(target)}
                onProfileUpdated={(updated) => setUserProfile(updated)}
              />
            )}
  
            {currentScreen === 'Settings' && (
              <SettingsScreen
                userProfile={userProfile}
                onBack={goBack}
                onNavigate={(screen) => {
                  if (screen === 'BlockedUsers') { setScreenHistory((prev) => [...prev, currentScreen]); setCurrentScreen('BlockedUsers'); }
                  else if (screen === 'MyReports') { setScreenHistory((prev) => [...prev, currentScreen]); setCurrentScreen('MyReports'); }
                  else if (screen === 'Notifications') { setScreenHistory((prev) => [...prev, currentScreen]); setCurrentScreen('Notifications'); }
                  else navigateTo(screen);
                }}
              />
            )}

            {currentScreen === 'BlockedUsers' && (
              <BlockedUsersScreen
                userProfile={userProfile}
                onBack={goBack}
              />
            )}

            {currentScreen === 'MyReports' && (
              <MyReportsScreen
                userProfile={userProfile}
                onBack={goBack}
                onOpenReport={(report) => {
                  setSelectedReport(report);
                  setScreenHistory((prev) => [...prev, currentScreen]);
                  setCurrentScreen('ReportDetail');
                }}
              />
            )}

            {currentScreen === 'ReportDetail' && selectedReport && (
              <ReportDetailScreen
                userProfile={userProfile}
                report={selectedReport}
                onBack={goBack}
              />
            )}

            {currentScreen === 'Notifications' && (
              <NotificationsScreen
                userProfile={userProfile}
                onBack={goBack}
                onNavigate={(screen, data) => navigateTo(screen, data)}
              />
            )}

            {currentScreen === 'ReportUser' && reportContext && (
              <ReportUserScreen
                userProfile={userProfile}
                reportedUser={reportContext}
                onBack={goBack}
                onSubmitted={() => {
                  setScreenHistory((prev) => prev.slice(0, -1));
                  setCurrentScreen('MyReports');
                }}
              />
            )}
  
            {/* Persistent Bottom Navigation Bar for Main Tab Screens.
                'Profile' is deliberately excluded: it is reached from the Profile
                tab, but the screen itself shows only its own back button.
                Suppressed when the desktop rail is showing, so wide web never
                has two navigation surfaces stacked on the same screen. */}
            {isNavScreen(currentScreen, isInChat) && !showRail && (
              <BottomNavBar
                userRole={userRole}
                currentScreen={currentScreen}
                onNavigate={(target) => navigateTo(target)}
                onBookRide={() => navigateTo('BookRide')}
                unreadMessagesCount={unreadCount}
                hasUnreadMessages={unreadCount > 0}
              />
            )}
          </Animated.View>
        </SafeAreaView>
      </SafeAreaProvider>
    </AppShell>
  );
}

/**
 * DialogHost is mounted here, as a sibling of the navigator rather than
 * inside any of its three return trees.
 *
 * Two reasons it cannot live inside AppRouter:
 *   - AppRouter has three separate return points (loading, admin, main).
 *     Mounting per-branch would mean three chances to forget one.
 *   - The main branch wraps every screen in an Animated.View. On web that
 *     ancestor opacity creates a stacking context, which would trap the
 *     dialog's position:fixed overlay behind the screen instead of over it.
 *
 * On native DialogHost returns null, so the rendered tree is identical to
 * before this change and the phone is unaffected.
 */
function App() {
  return (
    <>
      <AppRouter />
      <DialogHost />
    </>
  );
}

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
