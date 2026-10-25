import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  LayoutAnimation,
  UIManager,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { supabase } from '../../config/supabase';
import {
  getPendingUsers,
  getAllUsers,
  approveUser,
  rejectUser,
  getUserStats,
} from '../../data/auth';
import { applyModeration, liftModeration } from '../../data/moderation';
import { getReportMessages, sendReportMessage } from '../../data/reports';
import { createAnnouncement, getActiveAnnouncements } from '../../data/announcements';
import { createNotification } from '../../data/notifications';
import { alertDialog, confirmDialog } from '../../lib/dialog';

// ── Phase 3: Batch processing helper ──────────────────────────────────────────
// Processes an array of items in controlled chunks to avoid overloading the DB.
const processBatch = async (items, handler, chunkSize = 5) => {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map((item) => handler(item).catch(() => {})));
  }
};

// Minimum ms between successive bulk operations (abuse / spam guard)
const BULK_COOLDOWN_MS = 3000;

if (Platform.OS === 'web' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DESKTOP_BREAKPOINT = 768;
const SIDEBAR_WIDTH = 260;

const NAV_ITEMS = [
  { key: 'pending', label: 'Pending', icon: 'pending-actions' },
  { key: 'all', label: 'All Users', icon: 'people' },
  { key: 'students', label: 'Students', icon: 'school' },
  { key: 'drivers', label: 'Drivers', icon: 'directions-car' },
  { key: 'reports', label: 'Reports', icon: 'report' },
  { key: 'moderations', label: 'Moderation', icon: 'gavel' },
  { key: 'announcements', label: 'Announcements', icon: 'campaign' },
];

export default function AdminDashboardScreen({ userProfile, onBack, onLogout }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= DESKTOP_BREAKPOINT;

  const [activeTab, setActiveTab] = useState('pending');
  const [expandedId, setExpandedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [pendingUsers, setPendingUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, students: 0, drivers: 0 });
  const [loading, setLoading] = useState(true);

  // ── Per-user in-flight lock: one click = one approval ──────────────────────
  // The ref is the real guard. State alone is too late — two fast clicks both
  // read the pre-update state and both fire, which is what sent duplicate
  // push notifications / emails. The state set only drives the spinner.
  const inFlight = useRef(new Set());
  const [busyIds, setBusyIds] = useState(new Set());

  const setUserBusy = (id, busy) => {
    if (busy) inFlight.current.add(id);
    else inFlight.current.delete(id);
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // ── Phase 1: Bulk selection state ─────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  // Phase 3: track last bulk action timestamp to enforce cooldown
  const lastBulkAt = useRef(0);

  // Clear selection whenever the admin switches tabs
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  const refreshData = useCallback(async () => {
    try {
      const [pending, all, userStats] = await Promise.all([
        getPendingUsers(),
        getAllUsers(),
        getUserStats(),
      ]);
      setPendingUsers(pending);
      setAllUsers(all);
      setStats(userStats);
    } catch (e) {
      showToast('Failed to load data', 'error');
    }
  }, []);

  useEffect(() => {
    refreshData().finally(() => setLoading(false));
  }, [refreshData]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-new-users')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'profiles' },
        (payload) => {
          refreshData();
          const name = payload.new?.full_name || 'A new user';
          const role = payload.new?.role || 'user';
          showToast(`${name} registered as ${role}`, 'success');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshData]);

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  };

  const handleApprove = async (user) => {
    // A second click while the first is still running returns here and stops —
    // no duplicate approval, no duplicate notification to the user.
    if (inFlight.current.has(user.id)) return;
    setUserBusy(user.id, true);

    try {
      await approveUser(user.id, user);
      // Show the result immediately. Waiting on refreshData() first is what made
      // the button look dead for a second or two, inviting a second click.
      showToast(`${user.full_name} approved & notified`, 'success');
      await refreshData();
    } catch (e) {
      showToast('Failed to approve user', 'error');
    } finally {
      setUserBusy(user.id, false);
    }
  };

  const handleReject = async (user) => {
    if (inFlight.current.has(user.id)) return;
    setUserBusy(user.id, true);

    try {
      await rejectUser(user.id);
      showToast(`${user.full_name} rejected`, 'error');
      await refreshData();
    } catch (e) {
      showToast('Failed to reject user', 'error');
    } finally {
      setUserBusy(user.id, false);
    }
  };

  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  // ── Phase 1: Selection helpers ─────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(pendingUsers.map((u) => u.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const allSelected =
    pendingUsers.length > 0 && selectedIds.size === pendingUsers.length;

  // ── Phase 2 + 3: Bulk action handlers ─────────────────────────────────────
  const handleBulkApprove = async () => {
    if (bulkLoading || selectedIds.size === 0) return;

    // Phase 3: Cooldown guard
    const now = Date.now();
    if (now - lastBulkAt.current < BULK_COOLDOWN_MS) {
      showToast(`Please wait a moment before bulk actions`, 'error');
      return;
    }
    lastBulkAt.current = now;

    setBulkLoading(true);
    const targets = pendingUsers.filter((u) => selectedIds.has(u.id));
    try {
      await processBatch(targets, (user) => approveUser(user.id, user));
      await refreshData();
      showToast(`${targets.length} user(s) approved`, 'success');
      deselectAll();
    } catch (e) {
      showToast('Bulk approve partially failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkReject = async () => {
    if (bulkLoading || selectedIds.size === 0) return;

    // Phase 3: Cooldown guard
    const now = Date.now();
    if (now - lastBulkAt.current < BULK_COOLDOWN_MS) {
      showToast(`Please wait a moment before bulk actions`, 'error');
      return;
    }
    lastBulkAt.current = now;

    setBulkLoading(true);
    const targets = pendingUsers.filter((u) => selectedIds.has(u.id));
    try {
      await processBatch(targets, (user) => rejectUser(user.id));
      await refreshData();
      showToast(`${targets.length} user(s) rejected`, 'error');
      deselectAll();
    } catch (e) {
      showToast('Bulk reject partially failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const getFilteredUsers = () => {
    if (activeTab === 'pending') return pendingUsers;
    if (activeTab === 'students') return allUsers.filter((u) => u.role === 'student');
    if (activeTab === 'drivers') return allUsers.filter((u) => u.role === 'driver');
    return allUsers;
  };

  const filteredUsers = getFilteredUsers();
  const tabCounts = {
    pending: pendingUsers.length,
    all: allUsers.length,
    students: allUsers.filter((u) => u.role === 'student').length,
    drivers: allUsers.filter((u) => u.role === 'driver').length,
  };

  const renderCredentialRow = (icon, label, value) => (
    <View style={styles.credentialRow}>
      <MaterialIcons name={icon} size={16} color={COLORS.outline} />
      <Text style={styles.credentialLabel}>{label}</Text>
      <Text style={styles.credentialValue}>{value}</Text>
    </View>
  );

  const renderUserCard = (user) => {
    const isExpanded = expandedId === user.id;
    const isStudent = user.role === 'student';
    // Phase 1: check if this card is selected
    const isSelected = selectedIds.has(user.id);
    // This card has an approve/reject request still running
    const isBusy = busyIds.has(user.id);

    return (
      <View
        key={user.id}
        style={[
          styles.userCard,
          SHADOWS.diffusion,
          // Phase 1: highlight selected cards
          isSelected && styles.userCardSelected,
        ]}
      >
        <TouchableOpacity
          style={styles.userCardHeader}
          activeOpacity={0.7}
          onPress={() => toggleExpand(user.id)}
        >
          {/* Phase 1: Checkbox — only shown on Pending tab */}
          {activeTab === 'pending' && (
            <TouchableOpacity
              style={[
                styles.checkbox,
                isSelected && styles.checkboxChecked,
              ]}
              activeOpacity={0.7}
              onPress={() => toggleSelect(user.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isSelected && (
                <MaterialIcons name="check" size={14} color="#ffffff" />
              )}
            </TouchableOpacity>
          )}
          <View style={styles.userAvatar}>
            <MaterialIcons
              name={isStudent ? 'school' : 'directions-car'}
              size={24}
              color={COLORS.primary}
            />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.full_name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
          <View style={[styles.roleBadge, !isStudent && styles.roleBadgeDriver]}>
            <Text style={[styles.roleBadgeText, !isStudent && styles.roleBadgeTextDriver]}>
              {isStudent ? 'Student' : 'Driver'}
            </Text>
          </View>
          <MaterialIcons
            name={isExpanded ? 'expand-less' : 'expand-more'}
            size={24}
            color={COLORS.outline}
          />
        </TouchableOpacity>

        <View style={styles.userCardBody}>
          <View style={styles.userDetailRow}>
            <MaterialIcons name="call" size={16} color={COLORS.outline} />
            <Text style={styles.userDetailText}>{user.phone}</Text>
          </View>
          <View style={styles.userDetailRow}>
            <MaterialIcons name="calendar-today" size={16} color={COLORS.outline} />
            <Text style={styles.userDetailText}>Registered {user.created_at?.split('T')[0] || 'N/A'}</Text>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.credentialsSection}>
            <View style={styles.credentialsDivider} />
            <Text style={styles.credentialsTitle}>
              {isStudent ? 'Student Credentials' : 'Driver Credentials'}
            </Text>
            {renderCredentialRow('alternate-email', 'Username', user.username || 'N/A')}
            {isStudent ? (
              <>
                {renderCredentialRow('badge', 'Student ID', user.student_id || 'N/A')}
                {renderCredentialRow('account-balance', 'University', user.university || 'N/A')}
                {renderCredentialRow('menu-book', 'Course', user.course || 'N/A')}
                {renderCredentialRow('trending-up', 'Year Level', user.year_level || 'N/A')}
              </>
            ) : (
              <>
                {renderCredentialRow('credit-card', 'License No', user.license_no || 'N/A')}
                {renderCredentialRow('two-wheeler', 'Vehicle Type', user.vehicle_type || 'N/A')}
                {renderCredentialRow('confirmation-number', 'Plate Number', user.plate_number || 'N/A')}
                {renderCredentialRow('event', 'License Expiry', user.license_expiry || 'N/A')}
              </>
            )}
          </View>
        )}

        {activeTab === 'pending' && (
          <View style={styles.userCardActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.approveBtn, isBusy && styles.actionBtnBusy]}
              activeOpacity={0.8}
              disabled={isBusy}
              onPress={() => handleApprove(user)}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#ffffff" />
                  <Text style={styles.actionBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn, isBusy && styles.actionBtnBusy]}
              activeOpacity={0.8}
              disabled={isBusy}
              onPress={() => handleReject(user)}
            >
              {isBusy ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <MaterialIcons name="close" size={18} color="#ffffff" />
                  <Text style={styles.actionBtnText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {(activeTab === 'all' || activeTab === 'students' || activeTab === 'drivers') && (
          <View style={styles.userCardActions}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.tertiary }]} onPress={() => handleModerate(user.id, 'warn')}>
              <Text style={styles.actionBtnText}>Warn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#d97706' }]} onPress={() => handleModerate(user.id, 'suspend')}>
              <Text style={styles.actionBtnText}>Suspend</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]} onPress={() => handleModerate(user.id, 'ban')}>
              <Text style={styles.actionBtnText}>Ban</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.secondary }]} onPress={() => handleModerate(user.id, 'lift')}>
              <Text style={styles.actionBtnText}>Lift</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const renderStatsGrid = () => (
    <View style={[styles.statsGrid, isDesktop && styles.statsGridDesktop]}>
      <View style={[styles.statCard, isDesktop && styles.statCardDesktop, { backgroundColor: COLORS.primaryContainer }]}>
        <MaterialIcons name="people" size={28} color="#ffffff" />
        <Text style={styles.statNumber}>{stats.total}</Text>
        <Text style={styles.statLabel}>Total Users</Text>
      </View>
      <View style={[styles.statCard, isDesktop && styles.statCardDesktop, { backgroundColor: COLORS.tertiaryContainer }]}>
        <MaterialIcons name="pending-actions" size={28} color="#ffffff" />
        <Text style={styles.statNumber}>{stats.pending}</Text>
        <Text style={styles.statLabel}>Pending</Text>
      </View>
      <View style={[styles.statCard, isDesktop && styles.statCardDesktop, { backgroundColor: COLORS.secondaryContainer }]}>
        <MaterialIcons name="school" size={28} color={COLORS.onSecondaryContainer} />
        <Text style={[styles.statNumber, { color: COLORS.onSecondaryContainer }]}>{stats.students}</Text>
        <Text style={[styles.statLabel, { color: COLORS.onSecondaryContainer }]}>Students</Text>
      </View>
      <View style={[styles.statCard, isDesktop && styles.statCardDesktop, { backgroundColor: COLORS.surfaceContainerHigh }]}>
        <MaterialIcons name="directions-car" size={28} color={COLORS.onSurface} />
        <Text style={[styles.statNumber, { color: COLORS.onSurface }]}>{stats.drivers}</Text>
        <Text style={[styles.statLabel, { color: COLORS.onSurface }]}>Drivers</Text>
      </View>
    </View>
  );

  const renderSidebar = () => (
    <View style={styles.sidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarLogo}>TriRide</Text>
        <Text style={styles.sidebarRole}>Admin Panel</Text>
      </View>

      <View style={styles.sidebarNav}>
        {NAV_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.sidebarNavItem, activeTab === item.key && styles.sidebarNavItemActive]}
            activeOpacity={0.7}
            onPress={() => setActiveTab(item.key)}
          >
            <MaterialIcons
              name={item.icon}
              size={20}
              color={activeTab === item.key ? COLORS.primary : COLORS.onSurfaceVariant}
            />
            <Text
              style={[
                styles.sidebarNavText,
                activeTab === item.key && styles.sidebarNavTextActive,
              ]}
            >
              {item.label}
            </Text>
            {tabCounts[item.key] > 0 && (
              <View
                style={[
                  styles.sidebarBadge,
                  activeTab === item.key && styles.sidebarBadgeActive,
                ]}
              >
                <Text
                  style={[
                    styles.sidebarBadgeText,
                    activeTab === item.key && styles.sidebarBadgeTextActive,
                  ]}
                >
                  {tabCounts[item.key]}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sidebarFooter}>
        <TouchableOpacity style={styles.sidebarLogoutBtn} activeOpacity={0.7} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color={COLORS.error} />
          <Text style={styles.sidebarLogoutText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderMobileHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Text style={styles.headerTitle}>TriRide Admin</Text>
      </View>
      <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
        <MaterialIcons name="logout" size={22} color={COLORS.error} />
      </TouchableOpacity>
    </View>
  );

  const renderMobileTabBar = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mobileTabBar}>
      {NAV_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={[styles.mobileTab, activeTab === item.key && styles.mobileTabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab(item.key)}
        >
          <Text style={[styles.mobileTabText, activeTab === item.key && styles.mobileTabTextActive]}>
            {item.label}
          </Text>
          {tabCounts[item.key] > 0 && (
            <View style={[styles.mobileTabBadge, activeTab === item.key && styles.mobileTabBadgeActive]}>
              <Text style={[styles.mobileTabBadgeText, activeTab === item.key && styles.mobileTabBadgeTextActive]}>
                {tabCounts[item.key]}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );

  const [reports, setReports] = useState([]);
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportMessages, setReportMessages] = useState([]);
  const [reportMsgText, setReportMsgText] = useState('');
  const [announcements, setAnnouncements] = useState([]);
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', audience: 'all' });

  useEffect(() => {
    if (activeTab === 'reports') {
      supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false })
        .then(({ data }) => setReports(data || []));
    } else if (activeTab === 'announcements') {
      getActiveAnnouncements(null).then((data) => setAnnouncements(data || []));
    }
  }, [activeTab]);

  const openReport = async (report) => {
    setSelectedReport(report);
    const msgs = await getReportMessages(report.id);
    setReportMessages(msgs);
  };

  const sendReportMsg = async () => {
    if (!selectedReport || !reportMsgText.trim()) return;
    try {
      await sendReportMessage(selectedReport.id, userProfile.id, reportMsgText.trim());
      setReportMsgText('');
      const msgs = await getReportMessages(selectedReport.id);
      setReportMessages(msgs);
      await supabase
        .from('reports')
        .update({ status: 'in_progress', admin_id: userProfile.id, updated_at: new Date().toISOString() })
        .eq('id', selectedReport.id);
      showToast('Message sent', 'success');
    } catch (e) {
      showToast('Failed to send', 'error');
    }
  };

  const updateReportStatus = async (reportId, status, resolution_note = '') => {
    try {
      await supabase
        .from('reports')
        .update({ status, resolution_note, admin_id: userProfile.id, updated_at: new Date().toISOString() })
        .eq('id', reportId);
      showToast('Report updated', 'success');
      const { data } = await supabase.from('reports').select('*').order('created_at', { ascending: false });
      setReports(data || []);
      if (selectedReport?.id === reportId) setSelectedReport({ ...selectedReport, status });
    } catch (e) {
      showToast('Failed to update', 'error');
    }
  };

  const handleModerate = async (userId, action) => {
    const reason = action === 'lift' ? '' : 'Moderated by admin';
    try {
      if (action === 'lift') {
        await liftModeration({ userId, adminId: userProfile.id, reason });
      } else {
        await applyModeration({ userId, adminId: userProfile.id, action, reason });
      }
      // Notify user
      if (action !== 'lift') {
        await createNotification({
          userId,
          type: action,
          title: action === 'warn' ? 'Warning' : action === 'suspend' ? 'Account Suspended' : 'Account Banned',
          body: reason,
        });
      }
      showToast(`User ${action === 'lift' ? 'moderation lifted' : action + 'ed'}`, 'success');
    } catch (e) {
      showToast('Failed to moderate', 'error');
    }
  };

  const handleCreateAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.body) {
      showToast('Title and body required', 'error');
      return;
    }
    try {
      await createAnnouncement({ ...announcementForm, createdBy: userProfile.id });
      showToast('Announcement created', 'success');
      setAnnouncementForm({ title: '', body: '', audience: 'all' });
      getActiveAnnouncements(null).then((data) => setAnnouncements(data || []));
    } catch (e) {
      showToast('Failed to create', 'error');
    }
  };

  const renderMainContent = () => (
    <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesktop]} showsVerticalScrollIndicator={false}>
      <View style={[styles.welcomeSection, isDesktop && styles.welcomeSectionDesktop]}>
        <Text style={styles.welcomeName}>
          {NAV_ITEMS.find((n) => n.key === activeTab)?.label || 'Dashboard'}
        </Text>
        <Text style={styles.welcomeSubtitle}>
          {activeTab === 'pending'
            ? 'Review and approve new registration requests'
            : activeTab === 'all'
            ? 'Manage all registered users'
            : activeTab === 'students'
            ? 'View all registered students'
            : activeTab === 'drivers'
            ? 'View all registered drivers'
            : activeTab === 'reports'
            ? 'Manage user reports'
            : activeTab === 'moderations'
            ? 'Moderate users'
            : activeTab === 'announcements'
            ? 'Manage announcements'
            : ''}
        </Text>
      </View>

      {renderStatsGrid()}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {NAV_ITEMS.find((n) => n.key === activeTab)?.label}
          </Text>
          <View style={[styles.badge, filteredUsers.length > 0 && styles.badgeActive]}>
            <Text style={[styles.badgeText, filteredUsers.length > 0 && styles.badgeTextActive]}>
              {filteredUsers.length}
            </Text>
          </View>
        </View>

        {/* ── Phase 1: Select All / Deselect All row (Pending tab only) ── */}
        {activeTab === 'pending' && filteredUsers.length > 0 && (
          <View style={styles.selectionBar}>
            <TouchableOpacity
              style={styles.selectAllBtn}
              activeOpacity={0.7}
              onPress={allSelected ? deselectAll : selectAll}
            >
              <View style={[styles.checkbox, allSelected && styles.checkboxChecked]}>
                {allSelected && <MaterialIcons name="check" size={14} color="#ffffff" />}
              </View>
              <Text style={styles.selectAllText}>
                {allSelected ? 'Deselect All' : 'Select All'}
              </Text>
            </TouchableOpacity>
            {selectedIds.size > 0 && (
              <Text style={styles.selectionCount}>
                {selectedIds.size} selected
              </Text>
            )}
          </View>
        )}

        {/* ── Phase 2: Bulk Action Bar ── */}
        {activeTab === 'pending' && selectedIds.size > 0 && (
          <View style={styles.bulkActionBar}>
            {bulkLoading ? (
              <View style={styles.bulkLoadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.bulkLoadingText}>Processing...</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkApproveBtn]}
                  activeOpacity={0.8}
                  onPress={handleBulkApprove}
                >
                  <MaterialIcons name="done-all" size={18} color="#ffffff" />
                  <Text style={styles.bulkBtnText}>
                    Approve All ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.bulkBtn, styles.bulkRejectBtn]}
                  activeOpacity={0.8}
                  onPress={handleBulkReject}
                >
                  <MaterialIcons name="block" size={18} color="#ffffff" />
                  <Text style={styles.bulkBtnText}>
                    Reject All ({selectedIds.size})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.bulkCancelBtn}
                  activeOpacity={0.7}
                  onPress={deselectAll}
                >
                  <MaterialIcons name="close" size={18} color={COLORS.onSurfaceVariant} />
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {activeTab === 'reports' ? (
          selectedReport ? (
            <View style={styles.reportDetail}>
              <TouchableOpacity onPress={() => setSelectedReport(null)} style={styles.backLink}>
                <MaterialIcons name="arrow-back" size={18} color={COLORS.primary} />
                <Text style={styles.backLinkText}>Back to reports</Text>
              </TouchableOpacity>
              <View style={[styles.userCard, { marginTop: SPACING.md }]}>
                <Text style={styles.userName}>Report: {selectedReport.reason}</Text>
                <Text style={styles.userEmail}>Status: {selectedReport.status} | Reporter: {selectedReport.reporter_id?.slice(0,8)} | Reported: {selectedReport.reported_id?.slice(0,8)}</Text>
                {selectedReport.details ? <Text style={[styles.userDetailText, { marginTop: SPACING.sm }]}>{selectedReport.details}</Text> : null}
                <View style={styles.userCardActions}>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary }]} onPress={() => updateReportStatus(selectedReport.id, 'in_progress')}>
                    <Text style={styles.actionBtnText}>Mark In Progress</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.secondary }]} onPress={() => updateReportStatus(selectedReport.id, 'resolved')}>
                    <Text style={styles.actionBtnText}>Resolve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.error }]} onPress={() => updateReportStatus(selectedReport.id, 'dismissed')}>
                    <Text style={styles.actionBtnText}>Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={[styles.userCard, { marginTop: SPACING.md }]}>
                <Text style={styles.credentialsTitle}>Thread (Reporter & Admin only)</Text>
                <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                  {(reportMessages || []).map((m) => (
                    <View key={m.id} style={{ paddingVertical: SPACING.xs }}>
                      <Text style={styles.userDetailText}>{m.sender_id === userProfile.id ? 'Admin' : 'Reporter'}: {m.content}</Text>
                    </View>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
                  <TextInput style={[styles.input, { flex: 1 }]} value={reportMsgText} onChangeText={setReportMsgText} placeholder="Reply..." placeholderTextColor={COLORS.onSurfaceVariant} />
                  <TouchableOpacity style={[styles.actionBtn, { flex: 0, paddingHorizontal: SPACING.md, backgroundColor: COLORS.primary }]} onPress={sendReportMsg}>
                    <Text style={styles.actionBtnText}>Send</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.userList}>
              {(reports || []).map((r) => (
                <TouchableOpacity key={r.id} style={[styles.userCard, SHADOWS.diffusion]} onPress={() => openReport(r)}>
                  <View style={styles.userCardHeader}>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{r.reason}</Text>
                      <Text style={styles.userEmail}>Status: {r.status} • {new Date(r.created_at).toLocaleDateString()}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={24} color={COLORS.outline} />
                  </View>
                </TouchableOpacity>
              ))}
              {(reports || []).length === 0 && (
                <View style={styles.emptyState}>
                  <MaterialIcons name="report" size={64} color={COLORS.outlineVariant} />
                  <Text style={styles.emptyTitle}>No reports</Text>
                </View>
              )}
            </View>
          )
        ) : activeTab === 'announcements' ? (
          <View style={styles.userList}>
            <View style={[styles.userCard]}>
              <Text style={styles.credentialsTitle}>Create Announcement</Text>
              <TextInput style={styles.input} placeholder="Title" placeholderTextColor={COLORS.onSurfaceVariant} value={announcementForm.title} onChangeText={(t) => setAnnouncementForm({ ...announcementForm, title: t })} />
              <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="Body" placeholderTextColor={COLORS.onSurfaceVariant} multiline value={announcementForm.body} onChangeText={(t) => setAnnouncementForm({ ...announcementForm, body: t })} />
              <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
                {['all','students','drivers'].map((a) => (
                  <TouchableOpacity key={a} style={[styles.roleBadge, announcementForm.audience === a && styles.checkboxChecked]} onPress={() => setAnnouncementForm({ ...announcementForm, audience: a })}>
                    <Text style={[styles.roleBadgeText, announcementForm.audience === a && { color: '#fff' }]}>{a}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.primary, marginTop: SPACING.sm }]} onPress={handleCreateAnnouncement}>
                <Text style={styles.actionBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
            {(announcements || []).map((a) => (
              <View key={a.id} style={[styles.userCard]}>
                <Text style={styles.userName}>{a.title}</Text>
                <Text style={styles.userEmail}>{a.audience} • {new Date(a.created_at).toLocaleDateString()}</Text>
                <Text style={[styles.userDetailText, { marginTop: SPACING.sm }]}>{a.body}</Text>
              </View>
            ))}
          </View>
        ) : activeTab === 'moderations' ? (
          <View style={styles.userList}>
            <View style={[styles.userCard]}>
              <Text style={styles.credentialsTitle}>Quick Moderate User</Text>
              <Text style={styles.userDetailText}>Select a user from All Users tab to moderate, or use actions below conceptually. Use Warn/Suspend/Ban/Lift on specific users.</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: SPACING.sm }}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.tertiary, flex: 0, paddingHorizontal: SPACING.md }]} onPress={() => showToast('Go to All Users and use moderation actions', 'success')}>
                  <Text style={styles.actionBtnText}>Guide</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : filteredUsers.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons
              name={activeTab === 'pending' ? 'check-circle-outline' : 'people-outline'}
              size={64}
              color={COLORS.outlineVariant}
            />
            <Text style={styles.emptyTitle}>
              {activeTab === 'pending' ? 'All caught up!' : 'No users found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'pending'
                ? 'No pending registration requests'
                : `No ${activeTab === 'all' ? '' : activeTab} users to display`}
            </Text>
          </View>
        ) : (
          <View style={styles.userList}>
            {filteredUsers.map((user) => renderUserCard(user))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {toast && (
        <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError, isDesktop && styles.toastDesktop]}>
          <MaterialIcons
            name={toast.type === 'success' ? 'check-circle' : 'cancel'}
            size={20}
            color="#ffffff"
          />
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={{ marginTop: SPACING.md, color: COLORS.onSurfaceVariant }}>Loading users...</Text>
        </View>
      ) : isDesktop ? (
        <View style={styles.desktopLayout}>
          {renderSidebar()}
          <View style={styles.desktopContent}>
            {renderMainContent()}
          </View>
        </View>
      ) : (
        <>
          {renderMobileHeader()}
          {renderMobileTabBar()}
          {renderMainContent()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  toast: {
    position: 'absolute',
    top: 50,
    left: SPACING.marginMobile,
    right: SPACING.marginMobile,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: ROUNDED.md,
    zIndex: 100,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  toastDesktop: {
    top: 20,
    left: SIDEBAR_WIDTH + SPACING.lg,
    right: 'auto',
    maxWidth: 360,
  },
  toastSuccess: {
    backgroundColor: COLORS.secondary,
  },
  toastError: {
    backgroundColor: COLORS.error,
  },
  toastText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },

  // MOBILE HEADER
  header: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.primary,
    fontWeight: '800',
  },
  logoutBtn: {
    padding: SPACING.sm,
  },

  // MOBILE TAB BAR
  mobileTabBar: {
    flexGrow: 0,
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
  },
  mobileTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: ROUNDED.full,
    marginRight: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLow,
  },
  mobileTabActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  mobileTabText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: COLORS.onSurfaceVariant,
  },
  mobileTabTextActive: {
    color: '#ffffff',
  },
  mobileTabBadge: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ROUNDED.full,
    minWidth: 22,
    alignItems: 'center',
  },
  mobileTabBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  mobileTabBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  mobileTabBadgeTextActive: {
    color: '#ffffff',
  },

  // DESKTOP LAYOUT
  desktopLayout: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // SIDEBAR
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRightWidth: 1,
    borderRightColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    paddingTop: SPACING.lg,
  },
  sidebarHeader: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  sidebarLogo: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.primary,
    fontWeight: '800',
  },
  sidebarRole: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  sidebarNav: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: ROUNDED.md,
  },
  sidebarNavItemActive: {
    backgroundColor: COLORS.primaryFixed,
  },
  sidebarNavText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
  sidebarNavTextActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  sidebarBadge: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: ROUNDED.full,
    minWidth: 24,
    alignItems: 'center',
  },
  sidebarBadgeActive: {
    backgroundColor: COLORS.primaryContainer,
  },
  sidebarBadgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  sidebarBadgeTextActive: {
    color: '#ffffff',
  },
  sidebarFooter: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    paddingTop: SPACING.md,
  },
  sidebarLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderRadius: ROUNDED.md,
  },
  sidebarLogoutText: {
    ...TYPOGRAPHY.body,
    color: COLORS.error,
    fontWeight: '600',
  },

  // SCROLL CONTENT
  scrollContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 40,
  },
  scrollContentDesktop: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
  },

  // WELCOME
  welcomeSection: {
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  welcomeSectionDesktop: {
    marginTop: 0,
  },
  welcomeName: {
    ...TYPOGRAPHY.headlineLgMobile,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },

  // STATS
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  statsGridDesktop: {
    flexWrap: 'nowrap',
  },
  statCard: {
    width: '47%',
    aspectRatio: 1.4,
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statCardDesktop: {
    flex: 1,
    width: 'auto',
    aspectRatio: undefined,
    height: 110,
  },
  statNumber: {
    ...TYPOGRAPHY.headlineMd,
    color: '#ffffff',
    fontWeight: '700',
    marginTop: SPACING.xs,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: '#ffffff',
    marginTop: 2,
  },

  // SECTION
  section: {
    marginBottom: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: COLORS.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: ROUNDED.full,
    minWidth: 32,
    alignItems: 'center',
  },
  badgeActive: {
    backgroundColor: COLORS.tertiaryContainer,
  },
  badgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.onSurfaceVariant,
  },
  badgeTextActive: {
    color: COLORS.tertiary,
  },

  // EMPTY STATE
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING.xl * 2,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.onSurface,
    marginTop: SPACING.md,
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    marginTop: SPACING.xs,
  },

  // USER LIST
  userList: {
    gap: SPACING.md,
  },

  // USER CARD
  userCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  userEmail: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: COLORS.primaryFixed,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: ROUNDED.full,
  },
  roleBadgeDriver: {
    backgroundColor: COLORS.secondaryContainer,
  },
  roleBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '700',
    color: COLORS.primary,
  },
  roleBadgeTextDriver: {
    color: COLORS.onSecondaryContainer,
  },
  userCardBody: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  userDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  userDetailText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },

  // CREDENTIALS
  credentialsSection: {
    marginTop: SPACING.md,
  },
  credentialsDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginBottom: SPACING.md,
  },
  credentialsTitle: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  credentialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 6,
  },
  credentialLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    width: 100,
  },
  credentialValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
    fontWeight: '600',
    flex: 1,
  },

  // ACTIONS
  userCardActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: ROUNDED.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  approveBtn: {
    backgroundColor: COLORS.secondary,
  },
  rejectBtn: {
    backgroundColor: COLORS.error,
  },
  actionBtnText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  // Shown while a card's approve/reject is in flight
  actionBtnBusy: {
    opacity: 0.7,
  },

  // ── Phase 1: Checkbox styles ────────────────────────────────────────────
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.outline,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  userCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: COLORS.primaryFixed,
  },

  // Phase 1: Select All bar
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  selectAllText: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.primary,
  },
  selectionCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
  },

  // ── Phase 2: Bulk Action Bar ────────────────────────────────────────────
  bulkActionBar: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: ROUNDED.lg,
    padding: SPACING.sm,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  bulkBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 42,
    borderRadius: ROUNDED.md,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  bulkApproveBtn: {
    backgroundColor: COLORS.secondary,
  },
  bulkRejectBtn: {
    backgroundColor: COLORS.error,
  },
  bulkBtnText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
    fontSize: 13,
  },
  bulkCancelBtn: {
    width: 38,
    height: 38,
    borderRadius: ROUNDED.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
  },
  bulkLoadingRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  bulkLoadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
  },
  input: {
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  backLinkText: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  reportDetail: { gap: SPACING.md },
});
