import React, { useState, useEffect } from 'react';
import { StyleSheet, StatusBar, View, ActivityIndicator } from 'react-native';
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
import AdminDashboardScreen from './screens/admin/AdminDashboardScreen';
import MessagesScreen from './screens/shared/MessagesScreen';
import ProfileScreen from './screens/shared/ProfileScreen';
import { COLORS } from './theme';
import { getCurrentSession, getCurrentProfile, signOut } from './data/auth';

const getDashboardForRole = (role) => {
  if (role === 'admin') return 'AdminDashboard';
  if (role === 'driver') return 'DriverDashboard';
  return 'StudentDashboard';
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Splash');
  const [userRole, setUserRole] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [screenHistory, setScreenHistory] = useState([]);
  const [initializing, setInitializing] = useState(true);
  const [activeTripId, setActiveTripId] = useState(null);

  // Check for existing session on mount
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const session = await getCurrentSession();
        if (session) {
          const profile = await getCurrentProfile();
          if (profile && profile.status === 'approved') {
            setUserRole(profile.role);
            setUserProfile(profile);
            setCurrentScreen(getDashboardForRole(profile.role));
            setInitializing(false);
            return;
          }
        }
      } catch (e) {
        // No valid session, continue to splash
      }
      setInitializing(false);
    };
    restoreSession();
  }, []);

  const navigateTo = (screen) => {
    if (screen === 'Home') {
      setCurrentScreen(getDashboardForRole(userRole));
      setScreenHistory([]);
      return;
    }
    setScreenHistory((prev) => [...prev, currentScreen]);
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

  const handleLoginSuccess = (role, profile) => {
    setUserRole(role);
    setUserProfile(profile);
    setScreenHistory([]);
    setCurrentScreen(getDashboardForRole(role));
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      // Sign out even if Supabase call fails
    }
    setUserRole(null);
    setUserProfile(null);
    setScreenHistory([]);
    setCurrentScreen('Login');
  };

  // Show loading spinner while restoring session
  if (initializing) {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
          <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
        </View>
      </SafeAreaProvider>
    );
  }

  if (currentScreen === 'AdminDashboard') {
    return (
      <SafeAreaProvider>
        <View style={styles.container}>
          <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />
          <AdminDashboardScreen
            userProfile={userProfile}
            onBack={() => navigateTo('Login')}
            onLogout={handleLogout}
          />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.surface} />

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
          onNavigate={(target) => navigateTo(target)}
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
          onNavigate={(target) => navigateTo(target)}
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
          onCancelTrip={() => navigateTo('StudentDashboard')}
          onNavigate={(target) => navigateTo(target)}
        />
      )}

      {currentScreen === 'OrderDetails' && (
        <OrderDetailsScreen
          userProfile={userProfile}
          tripId={activeTripId}
          onGoBack={() => navigateTo('StudentDashboard')}
          onNavigate={(target) => navigateTo(target)}
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
          onAcceptRide={(tripId) => {
            setActiveTripId(tripId);
            navigateTo('CurrentTrip');
          }}
          onNavigate={(target) => navigateTo(target)}
        />
      )}

      {currentScreen === 'CurrentTrip' && (
        <CurrentTripScreen
          userProfile={userProfile}
          tripId={activeTripId}
          onTripCompleted={() => navigateTo('DriverDashboard')}
          onCancelTrip={() => navigateTo('DriverDashboard')}
          onNavigate={(target) => navigateTo(target)}
        />
      )}

      {currentScreen === 'Messages' && (
        <MessagesScreen
          userRole={userRole}
          userProfile={userProfile}
          onBack={goBack}
        />
      )}

      {currentScreen === 'Profile' && (
        <ProfileScreen
          userRole={userRole}
          userProfile={userProfile}
          onLogout={handleLogout}
          onBack={goBack}
        />
      )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
});
