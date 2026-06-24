const _v = '4.14';
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  LayoutDashboard, Building2, MapPin, Upload, ArrowLeft, FileText, Code,
  CheckSquare, Square, Calendar, DollarSign, Clock, Star, ExternalLink,
  SlidersHorizontal, Home, CheckCircle2, AlertCircle, X, Check, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, Undo2, Bookmark, User, Gavel, Settings, Users, Link2, Plus, Trash2,
  Briefcase, Contact, Search, Globe, Mail, Phone, ClipboardList, TrendingUp, LogOut, Filter, Map, BarChart2, Pencil
} from 'lucide-react';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const NOTE_TYPE_COLORS = { Review: '#7f77dd', 'Survey update': '#1d9e75', Legal: '#ba7517', Finance: '#378add', Task: '#8b5cf6', Flag: '#e24b4a' };
const NOTE_TYPE_BG     = { Review: '#eeedfe', 'Survey update': '#e1f5ee', Legal: '#faeeda', Finance: '#e6f1fb', Task: '#ede9fe', Flag: '#fcebeb' };
const NOTE_TYPE_TEXT   = { Review: '#3c3489', 'Survey update': '#085041', Legal: '#633806', Finance: '#0c447c', Task: '#5b21b6', Flag: '#791f1f' };
const NOTE_TYPE_PLACEHOLDERS = {
  Review: 'Write a review note about this property…',
  'Survey update': 'Log a survey update — findings, concerns, next steps…',
  Legal: 'Note a legal point — title issues, restrictions, caveats…',
  Finance: 'Record a finance note — costs, funding, lender update…',
  Task: 'Describe the action needed and who is responsible…',
  Flag: 'Flag a risk or concern that needs attention…',
};

export default function App({ user = {}, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [vw, setVw] = useState(window.innerWidth);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 1024);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handler = () => {
      setVw(window.innerWidth);
      if (window.innerWidth >= 768) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const isMobile  = vw < 768;
  const isTablet  = vw >= 768 && vw < 1024;

  useEffect(() => {
    if (isMobile && pipelineView === 'kanban') setPipelineView('table');
  }, [isMobile]);

  // Settings State
  const [settingsProfile, setSettingsProfile] = useState({ name: 'Ashley Austin-Buah', email: 'ashleyeab@gmail.com', company: 'A&A Partners' });
  const [settingsMapsKey, setSettingsMapsKey] = useState(import.meta.env.VITE_GOOGLE_MAPS_KEY || '');
  const [settingsTheme, setSettingsTheme] = useState({ accentColor: '#059669', sidebarColor: '#0f172a' });
  const [settingsNotifications, setSettingsNotifications] = useState({ newProperty: true, auctionCountdown: true, countdownDays: [7, 3, 1], noteAdded: true, newUser: true, newContact: false, newCompany: false });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [allUserNotifSettings, setAllUserNotifSettings] = useState(null);
  const [allUserNotifLoading, setAllUserNotifLoading] = useState(false);
  const [userNotifSaving, setUserNotifSaving] = useState({});
  const [userNotifSaved, setUserNotifSaved] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Change password state
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwStatus, setPwStatus] = useState(null); // { type: 'success'|'error', message }
  const [pwSaving, setPwSaving] = useState(false);

  const handleSaveSettings = () => {
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2500);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (pwNew.length < 8) { setPwStatus({ type: 'error', message: 'New password must be at least 8 characters.' }); return; }
    if (pwNew !== pwConfirm) { setPwStatus({ type: 'error', message: 'New passwords do not match.' }); return; }
    const token = localStorage.getItem('crm_session');
    setPwSaving(true); setPwStatus(null);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
      });
      const data = await res.json();
      if (data.success) {
        setPwStatus({ type: 'success', message: 'Password changed successfully.' });
        setPwCurrent(''); setPwNew(''); setPwConfirm('');
      } else {
        setPwStatus({ type: 'error', message: data.message || 'Failed to change password.' });
      }
    } catch {
      setPwStatus({ type: 'error', message: 'Network error — please try again.' });
    }
    setPwSaving(false);
  };

  const handleExportData = () => {
    const data = { properties, companies, contacts, globalNotes };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'crm-export.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearPipeline = () => {
    if (window.confirm('Clear all properties from the pipeline? This cannot be undone.')) setProperties([]);
  };

  // Users State
  const ALL_TABS = [
    { key: 'dashboard', label: 'Dashboard Summary' },
    { key: 'pipeline', label: 'Auction Pipeline' },
    { key: 'scraper', label: 'Auction Review Log' },
    { key: 'companies', label: 'Companies Directory' },
    { key: 'contacts', label: 'Contacts Roster' },
    { key: 'tasks', label: 'Tasks & Follow-ups' },
    { key: 'settings', label: 'Settings' },
  ];
  const [crmUsers, setCrmUsers] = useState([]);
  const [crmUsersLoaded, setCrmUsersLoaded] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState('Member');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [permEditUserId, setPermEditUserId] = useState(null);
  const [lastInviteLink, setLastInviteLink] = useState(null);
  const [auctionScanLoading, setAuctionScanLoading] = useState(false);
  const [auctionScanResults, setAuctionScanResults] = useState(null);
  const [openStatCard, setOpenStatCard] = useState(null);
  const [showListingEdit, setShowListingEdit] = useState(false);

  const loadCrmUsers = async () => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    try {
      const res = await fetch('/api/users', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) { setCrmUsers(data); setCrmUsersLoaded(true); }
    } catch {}
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;
    const token = localStorage.getItem('crm_session');
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newUserName, email: newUserEmail, role: newUserRole, allowedTabs: ['dashboard','pipeline','companies','contacts'] }),
      });
      const data = await res.json();
      if (data.success) {
        setNewUserName(''); setNewUserEmail(''); setNewUserRole('Member');
        setLastInviteLink({ link: data.inviteLink, emailSent: data.emailSent, emailError: data.emailError });
        await loadCrmUsers();
      } else alert(data.message || 'Failed to invite user.');
    } catch { alert('Network error.'); }
  };

  const handleRemoveUser = async (id) => {
    if (!window.confirm('Delete this user? This cannot be undone.')) return;
    const token = localStorage.getItem('crm_session');
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) await loadCrmUsers();
      else alert(data.message || 'Failed to delete user.');
    } catch { alert('Network error.'); }
  };

  const toggleUserTab = async (userId, tabKey) => {
    const updated = crmUsers.map(u => {
      if (u.id !== userId) return u;
      const has = (u.allowedTabs || []).includes(tabKey);
      return { ...u, allowedTabs: has ? u.allowedTabs.filter(t => t !== tabKey) : [...(u.allowedTabs || []), tabKey] };
    });
    setCrmUsers(updated);
    const newTabs = updated.find(u => u.id === userId)?.allowedTabs || [];
    const token = localStorage.getItem('crm_session');
    try {
      await fetch(`/api/users/${userId}/tabs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ allowedTabs: newTabs }),
      });
    } catch {}
  };
  const [currentViewProperty, setCurrentViewProperty] = useState(null);
  const [pipelineView, setPipelineView] = useState('kanban');
  const [propSidebarOpen, setPropSidebarOpen] = useState(false);
  const [companyDetailTab, setCompanyDetailTab] = useState('overview');
  const [settingsSection, setSettingsSection] = useState('profile');
  const [newCompPhone, setNewCompPhone] = useState('');
  const [newCompPremium, setNewCompPremium] = useState('');
  const [newCompAdminFee, setNewCompAdminFee] = useState('');
  
  // Immersive Deep View Navigation Selections
  const [currentViewCompany, setCurrentViewCompany] = useState(null);
  const [currentViewContact, setCurrentViewContact] = useState(null);

  // Layout Collapsibles States
  const [isDashTasksExpanded, setIsDashTasksExpanded] = useState(true);
  const [isPropNotesExpanded, setIsPropNotesExpanded] = useState(true);
  const [isPropChecklistExpanded, setIsPropChecklistExpanded] = useState(true);
  const [selectedGDVScenario, setSelectedGDVScenario] = useState('Base');

  // Unified Note Creation Fields
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('Review'); // options: Review | Survey update | Legal | Finance | Task | Flag
  const [noteAuthor, setNoteAuthor] = useState('Ashley');
  const [noteDate, setNoteDate] = useState('');
  const [noteBookmark, setNoteBookmark] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Search Filter Strings
  const [companySearchType, setCompanySearchType] = useState('ALL');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // Manual Ingest Backup Inputs
  const [newScraperPlatform, setNewScraperPlatform] = useState('');
  const [newScraperDate, setNewScraperDate] = useState('');
  const [newScraperUrl, setNewScraperUrl] = useState('');
  const [newScraperLots, setNewScraperLots] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newGuidePrice, setNewGuidePrice] = useState('');
  const [newAuctionDate, setNewAuctionDate] = useState('');

  // ==========================================
  // 1. DATA FOR COMPANIES TAB
  // ==========================================
  const [companies, setCompanies] = useState([]);
  const [newCompName, setNewCompName] = useState('');
  const [newCompWeb, setNewCompWeb] = useState('');
  const [newCompType, setNewCompType] = useState('Auction House');
  const [newCompCity, setNewCompCity] = useState('');

  // ==========================================
  // 2. DATA FOR CONTACTS TAB
  // ==========================================
  const [contacts, setContacts] = useState([]);
  const [newConName, setNewConName] = useState('');
  const [newConEmail, setNewConEmail] = useState('');
  const [newConTitle, setNewConTitle] = useState('');
  const [newConPhone, setNewConPhone] = useState('');
  const [newConCompanyId, setNewConCompanyId] = useState('');
  const [newConOrigin, setNewConOrigin] = useState('');

  // ==========================================
  // 3. UNIFIED GLOBAL ACTIVITIES NOTE STORE
  // ==========================================
  const [globalNotes, setGlobalNotes] = useState([]);

  // ==========================================
  // 4. MASTER PROPERTIES STATE LEDGER
  // ==========================================
  const [properties, setProperties] = useState([]);

  const [scrapedAuctions, setScrapedAuctions] = useState([]);

  // ==========================================
  // 5. SURVEYOR INTELLIGENCE STATE
  // ==========================================
  const [surveyors, setSurveyors] = useState([]);
  const [newSurveyorName, setNewSurveyorName] = useState('');
  const [newSurveyorCompany, setNewSurveyorCompany] = useState('');
  const [newSurveyorPhone, setNewSurveyorPhone] = useState('');
  const [newSurveyorEmail, setNewSurveyorEmail] = useState('');
  const [newSurveyorSpeciality, setNewSurveyorSpeciality] = useState('Residential');
  const [expandedSurveyorId, setExpandedSurveyorId] = useState(null);
  const [logJobSurveyorId, setLogJobSurveyorId] = useState(null);
  const [jobFormAddress, setJobFormAddress] = useState('');
  const [jobFormCost, setJobFormCost] = useState('');
  const [jobFormTurnaround, setJobFormTurnaround] = useState('');
  const [jobFormRating, setJobFormRating] = useState(0);
  const [jobFormNotes, setJobFormNotes] = useState('');
  const [jobFormDate, setJobFormDate] = useState('');

  // ==========================================
  // 6. AUCTION INTELLIGENCE STATE
  // ==========================================
  const [watchlist, setWatchlist] = useState([]);
  const [newWatchAddress, setNewWatchAddress] = useState('');
  const [newWatchPlatform, setNewWatchPlatform] = useState('');
  const [newWatchGuidePrice, setNewWatchGuidePrice] = useState('');
  const [newWatchAuctionDate, setNewWatchAuctionDate] = useState('');
  const [newWatchNotes, setNewWatchNotes] = useState('');

  // Filters State Hub
  const [filterSource, setFilterSource] = useState('ALL');
  const [filterType, setFilterType] = useState('ALL');
  const [filterMaxGuide, setFilterMaxGuide] = useState('');
  const [filterBedrooms, setFilterBedrooms] = useState('ALL');
  const [filterRecommendation, setFilterRecommendation] = useState('ALL');

  // ==========================================
  // OPERATIONAL METHODS ENGINE
  // ==========================================
  const handleAddCompany = (e) => {
    e.preventDefault();
    if (!newCompName.trim()) return;
    setCompanies([...companies, { id: Date.now(), name: newCompName, website: newCompWeb || '--', type: newCompType, city: newCompCity || '--', phone: newCompPhone || '', buyersPremium: newCompPremium || '', adminFee: newCompAdminFee || '', owner: 'Ashley Austin-Buah', createdDate: new Date().toISOString().split('T')[0], costItems: [] }]);
    setNewCompName(''); setNewCompWeb(''); setNewCompCity(''); setNewCompPhone(''); setNewCompPremium(''); setNewCompAdminFee('');
  };

  // Companies House lookup — routed through the worker proxy to avoid CORS
  const searchCompaniesHouse = async () => {
    if (!chQuery.trim()) return;
    setChLoading(true); setChResults(null);
    try {
      const token = localStorage.getItem('crm_session');
      const headers = { 'Authorization': `Bearer ${token}` };
      if (settingsIntegrations.companiesHouse) headers['X-CH-Key'] = settingsIntegrations.companiesHouse;
      const res = await fetch(`/api/companies-house/search?q=${encodeURIComponent(chQuery)}`, { headers });
      const data = await res.json();
      if (!data.success) { alert(data.message || 'Companies House lookup failed.'); setChResults([]); }
      else setChResults(data.items || []);
    } catch {
      setChResults([]);
    } finally {
      setChLoading(false);
    }
  };

  // Land Registry Price Paid lookup — routed through the worker proxy
  const searchLandRegistry = async () => {
    if (!lrPostcode.trim()) return;
    setLrLoading(true); setLrResults(null);
    try {
      const token = localStorage.getItem('crm_session');
      const res = await fetch(`/api/land-registry?postcode=${encodeURIComponent(lrPostcode.trim())}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) { alert(data.message || 'Land Registry lookup failed.'); setLrResults([]); }
      else setLrResults(data.items || []);
    } catch {
      setLrResults([]);
    } finally {
      setLrLoading(false);
    }
  };

  // Add a Land Registry record to the current property's comparables
  const addLandRegistryComp = (rec) => {
    if (!currentViewProperty) return;
    const comp = { id: Date.now() + Math.random(), address: [rec.address, rec.town].filter(Boolean).join(', '), soldDate: rec.date, soldPrice: rec.price, bedrooms: 0, source: 'Land Registry', notes: [rec.propertyType, rec.newBuild ? 'New build' : ''].filter(Boolean).join(' · ') };
    const up = { ...currentViewProperty, comparables: [...(currentViewProperty.comparables || []), comp] };
    setCurrentViewProperty(up);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? up : p));
  };

  // EPC lookup — routed through the worker proxy (Basic auth held server-side)
  const searchEpc = async () => {
    const pc = (epcQuery || '').trim() || ((currentViewProperty?.address || '').toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/)?.[0] || '');
    if (!pc) { alert('Enter a postcode to search EPC records.'); return; }
    setEpcQuery(pc);
    setEpcLoading(true); setEpcResult(null); setEpcError(null);
    try {
      const token = localStorage.getItem('crm_session');
      const res = await fetch(`/api/epc?postcode=${encodeURIComponent(pc)}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) { setEpcError(data.message || 'EPC lookup failed.'); setEpcResult([]); }
      else setEpcResult(data.items || []);
    } catch (err) {
      setEpcError('Could not reach EPC service — check your network connection.');
      setEpcResult([]);
    } finally {
      setEpcLoading(false);
    }
  };

  // Extract postcode from an address string
  const extractPostcode = (str) => {
    const m = (str || '').toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/);
    return m ? m[0] : '';
  };

  // Run all public API connectors for a property and merge results
  const runPropertyIntelligence = async (prop) => {
    const postcode = (prop.postcode || extractPostcode(prop.address || '')).trim().toUpperCase();
    const lat = prop.lat || null;
    const lng = prop.lng || null;
    if (!postcode && !lat) {
      alert('This property needs a postcode or address with postcode to run intelligence.\n\nEdit the address to include a postcode (e.g. S2 4AA) then try again.');
      return;
    }
    setIntelligenceRunning(true);
    const token = localStorage.getItem('crm_session');
    try {
      const res = await fetch('/api/intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ postcode, address: prop.address || '', lat, lng }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.message || 'Intelligence run failed.'); return; }

      const intel = data.intelligence;
      const addrData = intel.connectors?.address?.data;
      const lrData   = intel.connectors?.landRegistry?.data;
      const epcData  = intel.connectors?.epc?.data;

      // Apply data: API fills empty fields only (priority: manual > report > auction > API)
      const updates = {};
      if (addrData) {
        if (!prop.lat && addrData.lat)            updates.lat = addrData.lat;
        if (!prop.lng && addrData.lng)            updates.lng = addrData.lng;
        if (!prop.localAuthority && addrData.localAuthority) updates.localAuthority = addrData.localAuthority;
        if (!prop.ward && addrData.ward)          updates.ward = addrData.ward;
        if (!prop.region && addrData.region)      updates.region = addrData.region;
        if (!prop.postcode && addrData.postcode)  updates.postcode = addrData.postcode;
      }
      // EPC: fill only if not already set by report
      if (epcData?.best && !prop.analytics?.epcRating) {
        if (!prop.epcRating && epcData.epcRating)   updates.epcRating = epcData.epcRating;
        if (!prop.floorArea && epcData.floorArea)    updates.floorArea = epcData.floorArea;
      }
      // Land Registry: merge comparables, avoid duplicates
      if (lrData?.items?.length > 0) {
        const existComps = prop.comparables || [];
        const existLrIds = new Set(existComps.filter(c => c.fromIntelligence).map(c => c.id));
        const newComps = lrData.items.slice(0, 12).map(it => ({
          id: `lr-${it.date}-${(it.address||'').replace(/\s/g,'')}`,
          address: [it.address, it.town].filter(Boolean).join(', '),
          soldDate: it.date, soldPrice: it.price, bedrooms: 0,
          source: 'Land Registry', notes: it.propertyType || '', fromIntelligence: true,
        })).filter(c => !existLrIds.has(c.id));
        if (newComps.length > 0) updates.comparables = [...existComps, ...newComps];
      }
      // Store full intelligence payload
      updates.intelligence = { ...(prop.intelligence || {}), ...intel, lastRun: new Date().toISOString() };

      const successKeys = Object.entries(intel.connectors || {}).filter(([,v]) => v.status==='success').map(([k]) => k);
      const updatedProp = withActivity(
        { ...prop, ...updates },
        'intelligence',
        `Intelligence run — ${successKeys.length} connector${successKeys.length!==1?'s':''} succeeded (${successKeys.join(', ')})`,
      );
      setCurrentViewProperty(updatedProp);
      setProperties(prev => prev.map(p => p.id === updatedProp.id ? updatedProp : p));
    } catch {
      alert('Intelligence run failed — please check your connection.');
    } finally {
      setIntelligenceRunning(false);
    }
  };

  // Check for duplicate properties when uploading a report that may match an existing record
  const checkDuplicateAndMerge = async (analytics, fileRecord, existingPropId) => {
    const postcode = extractPostcode(analytics?.address || '') || extractPostcode(currentViewProperty?.address || '');
    const address = analytics?.address || currentViewProperty?.address || '';
    if (!postcode && !address) return false; // can't check — proceed normally

    const token = localStorage.getItem('crm_session');
    try {
      const res = await fetch('/api/intelligence/duplicate-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          postcode, address,
          listingUrl: currentViewProperty?.listingUrl || '',
          properties: properties.filter(p => p.id !== existingPropId),
        }),
      });
      const data = await res.json();
      if (data.success && data.matches?.length > 0 && data.matches[0].confidence >= 60) {
        setDuplicateModal({ matches: data.matches, pendingAnalytics: analytics, pendingFileRecord: fileRecord });
        return true; // blocked — waiting for user decision
      }
    } catch {}
    return false;
  };

  // Apply a report's analytics onto a property (called after duplicate modal or direct upload)
  const applyReportToProperty = (targetProp, analytics, fileRecord, fileKey = 'mainReport') => {
    const existing = targetProp.analytics || {};
    const merged = { ...existing };
    // All fields the report parser can produce — must be kept in sync with parseFullReportAnalytics
    const reportFields = [
      'maxBid', 'netProfit', 'margin', 'profitMargin', 'roi',
      'gdvBase', 'gdvConservative', 'gdvOptimistic', 'conservativeGDV', 'maxGDV',
      'totalInvestment', 'worksTotal', 'epcRating', 'floorArea', 'verdict', 'bidStrength',
      'walkAway', 'targetBid', 'stretchBid', 'breakEvenBid',
      // GDV scenario matrices (required for the bid matrix display)
      'matrixConservative', 'matrixBase', 'matrixOptimistic', 'matrixHeaders',
      // Cost stack breakdown
      'buyersPremium', 'sdlt', 'acquisitionFeesTotal', 'holdingTotal', 'exitTotal',
      // Refurb scenarios
      'refurbLight', 'refurbMedium', 'refurbHeavy',
      // Metadata
      'completionDate', 'auctionHouseFromReport', 'propertyTypeFromReport', 'comps',
    ];
    for (const f of reportFields) {
      if (analytics[f] != null) merged[f] = analytics[f];
    }

    // Apply address/postcode from report if not already set
    const extraUpdates = {};
    // Guide price lives on the property directly (not in analytics)
    if (analytics.guidePrice && !targetProp.guidePrice) {
      extraUpdates.guidePrice = analytics.guidePrice;
    }
    if (analytics.reportPostcode && !targetProp.postcode) {
      extraUpdates.postcode = analytics.reportPostcode;
    }
    if (analytics.reportAddress) {
      // Strip postcode from reportAddress to make a clean dealName
      const cleanAddr = analytics.reportAddress.replace(/\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i, '').replace(/,\s*$/, '').trim();
      // Only set dealName if not already set manually, or if current one contains the postcode
      const currentDealName = targetProp.dealName || '';
      const hasPostcodeInName = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i.test(currentDealName);
      if (!currentDealName || hasPostcodeInName) {
        extraUpdates.dealName = cleanAddr || currentDealName.replace(/\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i, '').trim();
      }
    }
    // Also strip postcode from existing dealName even if report has no address
    if (!extraUpdates.dealName) {
      const dn = targetProp.dealName || '';
      const pcMatch = dn.match(/\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
      if (pcMatch) {
        extraUpdates.dealName = dn.replace(pcMatch[0], '').replace(/,\s*$/, '').trim();
        if (!extraUpdates.postcode && !targetProp.postcode) extraUpdates.postcode = pcMatch[1].toUpperCase();
      }
    }
    // Detect conflicts with existing API intelligence
    const intel = targetProp.intelligence;
    const conflicts = [];
    if (intel?.connectors?.epc?.data?.epcRating && analytics.epcRating &&
        intel.connectors.epc.data.epcRating !== analytics.epcRating) {
      conflicts.push(`EPC rating: API says ${intel.connectors.epc.data.epcRating}, report says ${analytics.epcRating}`);
    }
    const updatedProp = withActivity(
      {
        ...targetProp,
        analytics: merged,
        files: { ...(targetProp.files || {}), [fileKey]: fileRecord },
        ...extraUpdates,
        ...(conflicts.length > 0 ? { intelligenceConflicts: [...(targetProp.intelligenceConflicts||[]), ...conflicts.map(c => ({ text: c, at: new Date().toISOString(), resolved: false }))] } : {}),
      },
      'document',
      `Assessment report uploaded: ${fileRecord.name}${conflicts.length ? ` (${conflicts.length} conflict${conflicts.length!==1?'s':''} flagged)` : ''}`,
    );
    return updatedProp;
  };

  const handleAddContact = (e) => {
    e.preventDefault();
    if (!newConName.trim()) return;
    setContacts([...contacts, { id: Date.now(), name: newConName, email: newConEmail, jobTitle: newConTitle || '', phone: newConPhone || '', officePhone: '', linkedin: '', companyId: parseInt(newConCompanyId) || null, role: newConRole || 'Other', origin: newConOrigin || '', owner: 'Ashley Austin-Buah', lastActivity: new Date().toISOString().split('T')[0] }]);
    setNewConName(''); setNewConEmail(''); setNewConTitle(''); setNewConPhone(''); setNewConRole('');
  };

  const handleAddUnifiedNote = (e, targetType, targetId) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    setGlobalNotes([{ id: Date.now(), targetType, targetId, text: noteText, type: noteType, author: noteAuthor, date: noteDate || new Date().toISOString().split('T')[0], bookmarked: noteBookmark, done: false }, ...globalNotes]);
    setNoteText(''); setNoteBookmark(false);
  };

  const handleAddPropertyNote = (e) => {
    e.preventDefault();
    if (!noteText.trim() || !currentViewProperty) return;
    const newNote = { id: Date.now(), text: noteText, type: noteType, author: noteAuthor, date: noteDate || new Date().toISOString().split('T')[0], bookmarked: noteBookmark, done: false };
    const updatedProp = withActivity(
      { ...currentViewProperty, notesList: [...currentViewProperty.notesList, newNote] },
      'note',
      `Note added${noteType ? ` (${noteType})` : ''}: ${noteText.slice(0, 80)}${noteText.length > 80 ? '…' : ''}`,
    );
    setCurrentViewProperty(updatedProp);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updatedProp : p));
    fireNotif('/api/notify/note-added', { property: currentViewProperty, note: newNote, authorName: user.name || 'A team member' });
    setNoteText(''); setNoteBookmark(false);
  };

  const handleSaveEditPropertyNote = (noteId) => {
    if (!editingNoteText.trim()) return;
    const updated = {
      ...currentViewProperty,
      notesList: currentViewProperty.notesList.map(n => n.id === noteId ? { ...n, text: editingNoteText } : n),
    };
    setCurrentViewProperty(updated);
    setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const toggleNoteTaskState = (propertyId, noteId) => {
    setProperties(properties.map(p => {
      if (p.id === propertyId) {
        const updatedProp = { ...p, notesList: p.notesList.map(n => n.id === noteId ? { ...n, done: !n.done } : n) };
        if (currentViewProperty && currentViewProperty.id === propertyId) setCurrentViewProperty(updatedProp);
        return updatedProp;
      }
      return p;
    }));
  };

  const handleIncomingFileIngest = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setProperties([...properties, { id: Date.now(), address: file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, ' '), guidePrice: 160000, auctionDate: '2026-08-20', auctionTime: '10:30', maxBid: 210000, refurb: 18000, bedrooms: 3, propertyType: 'Detached', sourcePlatform: 'Auction House', listingUrl: 'https://www.auctionhouse.co.uk/southyorkshire', isConsideration: false, isStrongBid: true, planningToBid: false, surveyorStatus: 'called', surveyorDate: '', checklist: { legalReviewed: false, financeApproved: false, costsPriced: false }, notesList: [], files: { mainReport: { name: file.name, type: 'pdf' }, spriftReport: null, surveyFile: null, legalPack: null }, status: 'Sourced', hammerPrice: null, outcome: '' }]);
  };

  // Returns a copy of `prop` with a new activity entry prepended to activityLog
  const withActivity = (prop, type, detail) => ({
    ...prop,
    activityLog: [
      { id: Date.now() + Math.random(), type, detail, user: user.name || 'You', at: new Date().toISOString() },
      ...(prop.activityLog || []),
    ],
  });

  const updateFieldInView = (field, value) => {
    if (!currentViewProperty) return;
    let updated = { ...currentViewProperty, [field]: value };
    if (field === 'status' && value !== currentViewProperty.status) {
      updated = withActivity(updated, 'stage', `Stage changed: ${normaliseStatus(currentViewProperty.status)} → ${value}`);
    }
    setCurrentViewProperty(updated);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updated : p));
  };

  const updateCompanyField = (field, value) => {
    if (!currentViewCompany) return;
    const updated = { ...currentViewCompany, [field]: value };
    setCurrentViewCompany(updated);
    setCompanies(companies.map(c => c.id === currentViewCompany.id ? updated : c));
  };

  const updateContactField = (field, value) => {
    if (!currentViewContact) return;
    const updated = { ...currentViewContact, [field]: value };
    setCurrentViewContact(updated);
    setContacts(contacts.map(c => c.id === currentViewContact.id ? updated : c));
  };

  const toggleChecklistItem = (itemKey) => {
    if (!currentViewProperty) return;
    const updatedProp = { ...currentViewProperty, checklist: { ...currentViewProperty.checklist, [itemKey]: !currentViewProperty.checklist[itemKey] } };
    setCurrentViewProperty(updatedProp);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updatedProp : p));
  };

  const parseFullReportAnalytics = (htmlText) => {
    const a = {};
    const $ = (re) => { const m = htmlText.match(re); return m ? m[1] : null; };
    const n = (re) => { const v = $(re); return v ? parseInt(v.replace(/[£,\s]/g, '')) : null; };
    const f = (re) => { const v = $(re); return v ? parseFloat(v) : null; };

    a.verdict = ($(/class="big-verdict[^"]*"[^>]*>([^<]+)/) || '').trim();
    if (/STRONG BID/i.test(a.verdict)) a.bidStrength = 'Strong';
    else if (/DO NOT BID|AVOID|NOT A BID/i.test(a.verdict)) a.bidStrength = 'Avoid';
    else a.bidStrength = 'Conditional';

    // GDV values — will be populated by extractScenarios() below

    a.guidePrice = n(/Guide Price:\s*<strong>(£[\d,]+)<\/strong>/i)
      || n(/class="label">Guide Price<\/span>\s*<span class="value[^"]*">(£[\d,]+)/i)
      || n(/Guide\s+Price[^£\d]*(£[\d,]+)/i);
    a.totalAuctionFees = n(/Total auction[^<]*fees[^<]*<strong>~?(£[\d,]+)<\/strong>/i)
      || n(/total auction-imposed buyer fees[^£]*(£[\d,]+)/i);

    a.maxBid = n(/<label>Max (?:Safe )?Bid[^<]*<\/label>\s*<div class="value[^"]*">(£[\d,]+)/i);
    a.breakEvenBid = n(/<label>Break[- ]Even[^<]*<\/label>\s*<div class="value[^"]*">~?(£[\d,]+)/i);
    a.netProfit = n(/<label>Net Profit[^<]*<\/label>\s*<div class="value[^"]*">(£[\d,]+)/i);

    a.margin = f(/<span class="label">Margin<\/span>\s*<span class="value[^"]*">([\d.]+)%/i);
    a.roi = f(/<span class="label">ROI<\/span>\s*<span class="value[^"]*">([\d.]+)%/i);

    a.buyersPremium = n(/<span class="label">Buyer[^<]*Premium[^<]*<\/span>\s*<span class="value[^"]*">(£[\d,]+)/i);
    a.sdlt = n(/<span class="label">SDLT[^<]*<\/span>\s*<span class="value[^"]*">(£[\d,]+)/i);
    a.acquisitionFeesTotal = n(/<span class="label">Acquisition Fees? Total<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    a.worksTotal = n(/<span class="label">Works Total<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    a.holdingTotal = n(/<span class="label">Holding Total<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    a.exitTotal = n(/<span class="label">Exit Total<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    a.totalInvestment = n(/<span class="label">Total Investment<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    const netFromStack = n(/<span class="label">Net Profit<\/span>\s*<span class="value[^"]*"><strong>(£[\d,]+)/i);
    if (netFromStack) a.netProfit = netFromStack;

    a.refurbLight = n(/Light Refurb[\s\S]{0,400}?class="big[^"]*">(£[\d,]+)/i);
    a.refurbMedium = n(/Medium Refurb[\s\S]{0,400}?class="big[^"]*">(£[\d,]+)/i);
    a.refurbHeavy = n(/Heavy Refurb[\s\S]{0,400}?class="big[^"]*">(£[\d,]+)/i);

    a.walkAway = n(/class="bid-box walk"[\s\S]{0,400}?<div class="bid-price">(£[\d,]+)/i);
    a.targetBid = n(/class="bid-box target"[\s\S]{0,400}?<div class="bid-price">(£[\d,]+)/i);
    a.stretchBid = n(/class="bid-box stretch"[\s\S]{0,400}?<div class="bid-price">(£[\d,]+)/i);

    a.epcRating = $(/class="epc-chip epc-([A-G])"/i);
    a.completionDate = ($(/Completion:\s*<strong>([^<]+)<\/strong>/i) || $(/class="label">Completion[^<]*<\/span>\s*<span class="value[^"]*">([^<]+)/i) || '').trim() || null;
    a.auctionHouseFromReport = $(/class="label">Auction House<\/span>\s*<span class="value">([^<]+)/i);

    // Extract property address from the report
    const addrRaw = ($(/class="property-address[^"]*"[^>]*>([^<]+)/i)
      || $(/class="prop-address[^"]*"[^>]*>([^<]+)/i)
      || $(/class="report-title[^"]*"[^>]*>([^<]+)/i)
      || $(/class="property-title[^"]*"[^>]*>([^<]+)/i)
      || $(/class="subject-property[^"]*"[^>]*>([^<]+)/i)
      || $(/class="label">Property Address<\/span>\s*<span class="value[^"]*">([^<]+)/i)
      || $(/class="label">Address<\/span>\s*<span class="value[^"]*">([^<]+)/i)
      || $(/id="property[_-]address[^"]*"[^>]*>([^<]+)/i)
      || $(/<h1[^>]*>([^<]{10,100})<\/h1>/i)
    );
    if (addrRaw) {
      const addr = addrRaw.trim().replace(/\s+/g, ' ');
      a.reportAddress = addr;
      const pc = addr.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/);
      if (pc) a.reportPostcode = pc[0].replace(/\s+/, ' ');
    }
    // Also look for a standalone postcode field
    const pcField = $(/class="label">Postcode<\/span>\s*<span class="value[^"]*">([^<]+)/i)
      || $(/postcode[^"]*"[^>]*>([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i);
    if (pcField && !a.reportPostcode) a.reportPostcode = pcField.trim().toUpperCase();
    a.floorArea = $(/class="label">Floor Area<\/span>\s*<span class="value">([^<]+)/i);
    a.propertyTypeFromReport = $(/class="label">Property Type<\/span>\s*<span class="value">([^<(]+)/i);
    const compM = htmlText.match(/(\d+)\+?\s*comparables/i);
    if (compM) a.comps = parseInt(compM[1]);

    // ── GDV scenarios: anchor on class="label-sm" headings ──────────────
    // Each GDV section is a card containing:
    //   <div class="label-sm">Conservative GDV (Lender Floor)</div>
    //   <div style="font-size:18px...">£145,000</div>          ← GDV value
    //   <table class="scenario"><thead>...</thead><tbody>...</tbody></table>  ← matrix
    // We scan for every label-sm that names a GDV scenario, then find the next
    // table.scenario immediately after it.
    const scenarioLabelRe = /class="label-sm"[^>]*>([^<]*(Conservative|Base|Optimistic)\s+GDV[^<]*)<\/div>\s*<div[^>]*>(£[\d,]+)/gi;
    let slm;
    while ((slm = scenarioLabelRe.exec(htmlText)) !== null) {
      const type  = slm[2];                                    // "Conservative" | "Base" | "Optimistic"
      const gdvVal = parseInt(slm[3].replace(/[£,]/g, ''));

      // Find the <table class="scenario"> that follows this label
      const afterText = htmlText.slice(slm.index);
      const tblOffset = afterText.search(/<table[^>]*class="scenario"/i);
      let matrix = null;
      if (tblOffset > -1) {
        const tblStart = afterText.indexOf('<table', tblOffset);
        const tblEnd   = afterText.indexOf('</table>', tblStart) + '</table>'.length;
        const tblHtml  = afterText.slice(tblStart, tblEnd);

        // Capture column headers from <thead> (first time only)
        if (!a.matrixHeaders) {
          const headM = tblHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i);
          if (headM) {
            a.matrixHeaders = [...headM[1].matchAll(/<th[^>]*>([^<]+)<\/th>/gi)]
              .slice(1).map(t => t[1].trim()).filter(Boolean);
          }
        }

        // Extract rows from <tbody>
        const bodyM = tblHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
        if (bodyM) {
          const rows = [];
          const rowRe = /<tr[^>]*>\s*<th[^>]*>(£[\d,]+[^<]*)<\/th>([\s\S]*?)<\/tr>/gi;
          let rm;
          while ((rm = rowRe.exec(bodyM[1])) !== null) {
            const hammer = parseInt(rm[1].replace(/[£,]/g, ''));
            if (!hammer || hammer < 10000) continue;
            const cells = [];
            // <td class="good|bad"><strong>£profit</strong><span>margin%</span></td>
            const cellRe = /<td[^>]*>[\s\S]*?<strong>(-?£?[\d,]+)<\/strong>[\s\S]*?<span[^>]*>(-?[\d.]+)%<\/span>/gi;
            let cm;
            while ((cm = cellRe.exec(rm[2])) !== null) {
              cells.push({ profit: parseInt(cm[1].replace(/[£,]/g, '')), margin: parseFloat(cm[2]) });
            }
            if (cells.length) rows.push({ hammer, label: rm[1].trim(), cells });
          }
          if (rows.length) matrix = rows;
        }
      }

      if (/conserv/i.test(type)) {
        if (!a.gdvConservative) a.gdvConservative = gdvVal;
        if (!a.matrixConservative) a.matrixConservative = matrix;
      } else if (/base/i.test(type)) {
        if (!a.gdvBase) a.gdvBase = gdvVal;
        if (!a.matrixBase) a.matrixBase = matrix;
      } else if (/optim/i.test(type)) {
        if (!a.gdvOptimistic) a.gdvOptimistic = gdvVal;
        if (!a.matrixOptimistic) a.matrixOptimistic = matrix;
      }
    }

    // Aliases so display code works regardless of which key it reads
    a.conservativeGDV = a.gdvConservative;
    a.maxGDV = a.gdvOptimistic;
    if (a.margin != null) a.profitMargin = a.margin;  // display reads profitMargin

    return Object.values(a).filter(v => v !== null && v !== undefined).length > 5 ? a : null;
  };

  const parseReportAnalytics = parseFullReportAnalytics;

  const handleVaultUpload = async (e, fileKey) => {
    const file = e.target.files[0];
    if (!file || !currentViewProperty) return;
    const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm');

    // Parse analytics client-side before upload (needs raw text)
    let analytics = null;
    if (isHtml && fileKey === 'mainReport') {
      const text = await file.text();
      analytics = parseReportAnalytics(text);
    }

    // Upload to R2 via worker
    const token = localStorage.getItem('crm_session');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('propertyId', String(currentViewProperty.id));
    fd.append('fileKey', fileKey);

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!data.success) throw new Error('Upload rejected');

      const fileRecord = { name: file.name, type: isHtml ? 'html' : 'pdf', key: data.key };

      // For main report HTML: run duplicate check against other properties
      if (isHtml && fileKey === 'mainReport' && analytics) {
        const blocked = await checkDuplicateAndMerge(analytics, fileRecord, currentViewProperty.id);
        if (blocked) return; // user will decide via modal
      }

      // Apply report to current property using priority-aware merge
      const updatedProp = analytics && fileKey === 'mainReport'
        ? applyReportToProperty(currentViewProperty, analytics, fileRecord, fileKey)
        : withActivity(
            { ...currentViewProperty, files: { ...currentViewProperty.files, [fileKey]: fileRecord } },
            'document',
            `Document uploaded (${fileKey}): ${file.name}`,
          );

      setCurrentViewProperty(updatedProp);
      const updatedProperties = properties.map(p => p.id === currentViewProperty.id ? updatedProp : p);
      setProperties(updatedProperties);

      // Force an immediate KV save
      setSaveStatus('saving');
      fetch('/api/crm-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }),
      }).then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); })
        .catch(() => setSaveStatus('idle'));

    } catch {
      alert('Document upload failed — please check your connection and try again.');
    }
  };

  const handleViewDocument = async (record) => {
    if (!record) return;
    if (record.key) {
      const win = window.open('', '_blank');
      try {
        const token = localStorage.getItem('crm_session');
        const res = await fetch(`/api/documents/${record.key}`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('not found');
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        win.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
      } catch { win.close(); alert('Could not load document. It may have been uploaded in a previous session.'); }
    } else if (record.url) {
      window.open(record.url, '_blank');
    }
  };

  const handleDeleteProperty = (id) => {
    if (window.confirm('Delete this property from the pipeline?')) {
      setProperties(properties.filter(p => p.id !== id));
      if (currentViewProperty?.id === id) setCurrentViewProperty(null);
    }
  };

  const toggleScrapedReviewedState = (id) => {
    setScrapedAuctions(scrapedAuctions.map(sa => sa.id === id ? { ...sa, reviewed: !sa.reviewed } : sa));
  };

  const toggleGlobalNoteState = (id) => {
    setGlobalNotes(globalNotes.map(n => n.id === id ? { ...n, done: !n.done } : n));
  };

  const toggleConsideration = (id) => {
    setProperties(properties.map(p => p.id === id ? { ...p, isConsideration: !p.isConsideration } : p));
  };

  const handleScrapeUrl = async () => {
    if (!pipelineUrl.trim()) return;
    setUrlScraping(true);
    try {
      const token = localStorage.getItem('crm_session');
      const res = await fetch('/api/scrape-property', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: pipelineUrl.trim() }),
      });
      const data = await res.json();
      if (data.success && data.property) {
        const p = data.property;
        const newPropId = Date.now();
        const newPropFromUrl = {
          id: newPropId, address: p.address || 'Address not found', guidePrice: p.guidePrice || 0,
          auctionDate: p.auctionDate || '', auctionTime: p.auctionTime || '', bedrooms: p.bedrooms || 0,
          sourcePlatform: p.platform || 'URL Import', listingUrl: pipelineUrl.trim(),
          status: 'Sourced', propertyType: 'Residential', maxBid: 0, isStrongBid: false,
          isConsideration: false, planningToBid: false, notesList: [], files: {}, comparables: [],
          checklist: { legalReviewed: false, financeApproved: false, costsPriced: false },
          activityLog: [{ id: Date.now() + 1, type: 'created', detail: `Property added from auction link (${p.platform || 'URL Import'})`, user: user.name || 'You', at: new Date().toISOString() }],
          dataSource: 'auction_link',
        };
        setProperties(prev => [...prev, newPropFromUrl]);
        setPipelineUrl('');
      } else {
        alert(data.message || 'Could not extract property details — please fill in manually.');
      }
    } catch { alert('Network error. Please try again.'); }
    finally { setUrlScraping(false); }
  };

  const geocodeAddress = async (address, id) => {
    if (mapGeoCache[id]) return mapGeoCache[id];
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address + ', UK')}&format=json&limit=1`, {
        headers: { 'User-Agent': 'PropertyCRM/1.0' }
      });
      const data = await res.json();
      if (data[0]) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        setMapGeoCache(prev => ({ ...prev, [id]: coords }));
        return coords;
      }
    } catch {}
    return null;
  };

  const handleAddSurveyor = (e) => {
    e.preventDefault();
    if (!newSurveyorName.trim()) return;
    setSurveyors([...surveyors, { id: Date.now(), name: newSurveyorName, company: newSurveyorCompany, phone: newSurveyorPhone, email: newSurveyorEmail, speciality: newSurveyorSpeciality, ratings: [], notes: '' }]);
    setNewSurveyorName(''); setNewSurveyorCompany(''); setNewSurveyorPhone(''); setNewSurveyorEmail('');
  };

  const handleLogJob = (e, surveyorId) => {
    e.preventDefault();
    if (!jobFormAddress.trim()) return;
    const entry = { propertyId: null, propertyAddress: jobFormAddress, cost: parseFloat(jobFormCost) || 0, turnaroundDays: parseInt(jobFormTurnaround) || 0, rating: jobFormRating, date: jobFormDate || new Date().toISOString().split('T')[0], notes: jobFormNotes };
    setSurveyors(surveyors.map(s => s.id === surveyorId ? { ...s, ratings: [...s.ratings, entry] } : s));
    setJobFormAddress(''); setJobFormCost(''); setJobFormTurnaround(''); setJobFormRating(0); setJobFormNotes(''); setJobFormDate('');
    setLogJobSurveyorId(null);
  };

  const handleAddSurveyJob = (e) => {
    e.preventDefault();
    if (!currentViewProperty || !surveyJobContactId) return;
    const surveyor = contacts.find(c => c.id === parseInt(surveyJobContactId));
    const company = surveyor?.companyId ? companies.find(c => c.id === surveyor.companyId) : null;
    const turnaround = surveyJobDateBooked && surveyJobDateReceived
      ? Math.round((new Date(surveyJobDateReceived) - new Date(surveyJobDateBooked)) / 86400000)
      : null;
    const job = {
      id: Date.now(),
      contactId: parseInt(surveyJobContactId),
      surveyorName: surveyor?.name || '',
      companyId: surveyor?.companyId || null,
      companyName: company?.name || '',
      propertyId: currentViewProperty.id,
      propertyName: currentViewProperty.dealName || currentViewProperty.address,
      dateBooked: surveyJobDateBooked,
      surveyDate: surveyJobSurveyDate,
      dateReceived: surveyJobDateReceived,
      turnaroundRange: surveyJobTurnaroundRange,
      cost: parseFloat(surveyJobCost) || 0,
      turnaroundDays: turnaround,
      rating: surveyJobRating,
      notes: surveyJobNotes,
      wouldUseAgain: surveyJobWouldUse,
      loggedDate: new Date().toISOString().split('T')[0],
    };
    const updatedProp = withActivity(
      { ...currentViewProperty, surveyJobs: [...(currentViewProperty.surveyJobs || []), job] },
      'survey',
      `Survey logged${surveyor?.name ? ` with ${surveyor.name}` : ''}${job.cost ? ` — £${job.cost.toLocaleString()}` : ''}`,
    );
    setCurrentViewProperty(updatedProp);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updatedProp : p));
    setShowSurveyJobModal(false);
    setSurveyJobContactId(''); setSurveyJobDateBooked(''); setSurveyJobSurveyDate(''); setSurveyJobDateReceived('');
    setSurveyJobTurnaroundRange(''); setSurveyJobCost(''); setSurveyJobRating(0); setSurveyJobNotes(''); setSurveyJobWouldUse(true);
  };

  const handleAddWatchlistItem = (e) => {
    e.preventDefault();
    if (!newWatchAddress.trim()) return;
    setWatchlist([...watchlist, { id: Date.now(), address: newWatchAddress, platform: newWatchPlatform, guidePrice: parseFloat(newWatchGuidePrice) || 0, auctionDate: newWatchAuctionDate, auctionHouse: newWatchPlatform, notes: newWatchNotes, addedDate: new Date().toISOString().split('T')[0] }]);
    setNewWatchAddress(''); setNewWatchPlatform(''); setNewWatchGuidePrice(''); setNewWatchAuctionDate(''); setNewWatchNotes('');
  };

  const handlePromoteWatchlistItem = (item) => {
    setProperties([...properties, { id: Date.now(), address: item.address, guidePrice: item.guidePrice || 0, auctionDate: item.auctionDate, auctionTime: '12:00', maxBid: 0, refurb: 0, bedrooms: 0, propertyType: 'Unknown', sourcePlatform: item.platform || item.auctionHouse || 'Unknown', listingUrl: '', isConsideration: false, isStrongBid: false, planningToBid: false, surveyorStatus: 'called', surveyorDate: '', checklist: { legalReviewed: false, financeApproved: false, costsPriced: false }, notesList: [], files: { mainReport: null, spriftReport: null, surveyFile: null, legalPack: null }, status: 'Sourced', hammerPrice: null, outcome: '' }]);
    setWatchlist(watchlist.filter(w => w.id !== item.id));
  };

  // Countdown helper
  const getCountdown = (auctionDate) => {
    if (!auctionDate) return '—';
    const today = new Date(); today.setHours(0,0,0,0);
    const auction = new Date(auctionDate);
    const diff = Math.round((auction - today) / (1000 * 60 * 60 * 24));
    if (diff < 0) return 'Past';
    if (diff === 0) return 'Today';
    return `${diff} day${diff === 1 ? '' : 's'}`;
  };

  // SDLT Calculator (Oct 2024 budget: additional dwelling surcharge = 5%)
  const calcSDLT = (price, isAdditional = true) => {
    if (!price || price <= 0) return 0;
    const thresholds = [0, 250000, 925000, 1500000, Infinity];
    const rates = isAdditional ? [0.05, 0.10, 0.15, 0.17] : [0.00, 0.05, 0.10, 0.12];
    let tax = 0, remaining = price;
    for (let i = 0; i < rates.length; i++) {
      const bandSize = Math.min(remaining, thresholds[i + 1] - thresholds[i]);
      if (bandSize <= 0) break;
      tax += bandSize * rates[i];
      remaining -= bandSize;
      if (remaining <= 0) break;
    }
    return Math.round(tax);
  };

  // Status badge colour
  const getStatusStyle = (status) => {
    const map = {
      'Sourced':          { bg: '#f1f5f9', color: '#475569' },
      'Appraising':       { bg: '#eff6ff', color: '#1d4ed8' },
      'Approved':         { bg: '#ede9fe', color: '#6d28d9' },
      'Due Diligence':    { bg: '#fff7ed', color: '#c2410c' },
      'Bidding':          { bg: '#dcfce7', color: '#166534' },
      'Exchanged':        { bg: '#d1fae5', color: '#065f46' },
      'Outbid':           { bg: '#fee2e2', color: '#991b1b' },
      'No Bid':           { bg: '#fef3c7', color: '#92400e' },
      'Tracked':          { bg: '#e2e8f0', color: '#334155' },
      // legacy fallbacks so existing data still renders
      'Found':            { bg: '#f1f5f9', color: '#475569' },
      'Researching':      { bg: '#eff6ff', color: '#1d4ed8' },
      'Research Completed': { bg: '#ede9fe', color: '#6d28d9' },
      'Surveying':        { bg: '#fff7ed', color: '#c2410c' },
      'Won':              { bg: '#d1fae5', color: '#065f46' },
      'Lost':             { bg: '#fee2e2', color: '#991b1b' },
      'Withdrawn':        { bg: '#f1f5f9', color: '#64748b' },
    };
    return map[status] || map['Sourced'];
  };

  const PIPELINE_STAGES = ['Sourced', 'Appraising', 'Approved', 'Due Diligence', 'Bidding', 'Exchanged', 'Outbid', 'No Bid', 'Tracked'];

  // Map legacy stage names (from old data) to current stage names so kanban always shows them
  const LEGACY_STATUS_MAP = {
    'Found':              'Sourced',
    'Researching':        'Appraising',
    'Research Completed': 'Approved',
    'Surveying':          'Due Diligence',
    'Won':                'Exchanged',
    'Lost':               'Outbid',
    'Withdrawn':          'No Bid',
  };
  const normaliseStatus = (s) => LEGACY_STATUS_MAP[s] || s || 'Sourced';
  const STAGE_COLOURS = {
    'Sourced':        { bg: '#f8fafc', border: '#e2e8f0', head: '#64748b' },
    'Appraising':     { bg: '#eff6ff', border: '#bfdbfe', head: '#1d4ed8' },
    'Approved':       { bg: '#f5f3ff', border: '#ddd6fe', head: '#6d28d9' },
    'Due Diligence':  { bg: '#fff7ed', border: '#fed7aa', head: '#c2410c' },
    'Bidding':        { bg: '#f0fdf4', border: '#bbf7d0', head: '#166534' },
    'Exchanged':      { bg: '#ecfdf5', border: '#6ee7b7', head: '#065f46' },
    'Outbid':         { bg: '#fef2f2', border: '#fecaca', head: '#991b1b' },
    'No Bid':         { bg: '#fffbeb', border: '#fde68a', head: '#92400e' },
    'Tracked':        { bg: '#f8fafc', border: '#cbd5e1', head: '#475569' },
  };

  // Pipeline filters & view
  const [pipelineSort, setPipelineSort] = useState('newest');
  const [pipelineTypeFilter, setPipelineTypeFilter] = useState('ALL');
  const [pipelineStageFilter, setPipelineStageFilter] = useState('ALL');
  const [pipelineDateFrom, setPipelineDateFrom] = useState('');
  const [pipelineDateTo, setPipelineDateTo] = useState('');
  const [showPipelineFilters, setShowPipelineFilters] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [mapGeoCache, setMapGeoCache] = useState({});

  // Kanban drag & drop + collapsible stages
  const [draggedPropId, setDraggedPropId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [collapsedStages, setCollapsedStages] = useState([]);

  // Inline editing — surveyors
  const [editingSurveyorId, setEditingSurveyorId] = useState(null);
  const [editSurveyorName, setEditSurveyorName] = useState('');
  const [editSurveyorCompany, setEditSurveyorCompany] = useState('');
  const [editSurveyorPhone, setEditSurveyorPhone] = useState('');
  const [editSurveyorEmail, setEditSurveyorEmail] = useState('');
  const [editSurveyorSpeciality, setEditSurveyorSpeciality] = useState('Residential');

  // Inline editing — watchlist
  const [editingWatchlistId, setEditingWatchlistId] = useState(null);
  const [editWatchAddress, setEditWatchAddress] = useState('');
  const [editWatchPlatform, setEditWatchPlatform] = useState('');
  const [editWatchGuidePrice, setEditWatchGuidePrice] = useState('');
  const [editWatchDate, setEditWatchDate] = useState('');
  const [editWatchNotes, setEditWatchNotes] = useState('');

  // Inline editing — auction review log
  const [editingLogId, setEditingLogId] = useState(null);

  // URL scraping
  const [pipelineUrl, setPipelineUrl] = useState('');
  const [urlScraping, setUrlScraping] = useState(false);

  // Property detail collapsibles
  const [isPropVaultExpanded, setIsPropVaultExpanded] = useState(true);

  // Deal Analysis tab
  const [selectedAnalysisDealId, setSelectedAnalysisDealId] = useState(null);
  const [matrixGdvTab, setMatrixGdvTab] = useState('base');
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState([]);

  // Contact role
  const [newConRole, setNewConRole] = useState('');
  // Add property modal
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [newPropAddress, setNewPropAddress] = useState('');
  const [newPropGuide, setNewPropGuide] = useState('');
  const [newPropDate, setNewPropDate] = useState('');
  const [newPropPlatform, setNewPropPlatform] = useState('');
  const [newPropType, setNewPropType] = useState('Residential');
  // Survey job form (linked to contacts)
  const [showSurveyJobModal, setShowSurveyJobModal] = useState(false);
  const [surveyJobContactId, setSurveyJobContactId] = useState('');
  const [surveyJobDateBooked, setSurveyJobDateBooked] = useState('');
  const [surveyJobSurveyDate, setSurveyJobSurveyDate] = useState('');
  const [surveyJobDateReceived, setSurveyJobDateReceived] = useState('');
  const [surveyJobTurnaroundRange, setSurveyJobTurnaroundRange] = useState('');
  const [surveyJobCost, setSurveyJobCost] = useState('');
  const [surveyJobRating, setSurveyJobRating] = useState(0);
  const [surveyJobNotes, setSurveyJobNotes] = useState('');
  const [surveyJobWouldUse, setSurveyJobWouldUse] = useState(true);
  // Global search
  const [globalSearch, setGlobalSearch] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);

  // Feature 1: Tasks & Follow-ups
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('Medium');
  const [newTaskLinkedType, setNewTaskLinkedType] = useState('');
  const [newTaskLinkedId, setNewTaskLinkedId] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [taskFilter, setTaskFilter] = useState('open');

  // Feature 2: Deal Calculator
  const [dealCalcStrategy, setDealCalcStrategy] = useState('Flip');
  const [isDealCalcExpanded, setIsDealCalcExpanded] = useState(false);

  // Feature 3: Comparable Sales
  const [showComparableForm, setShowComparableForm] = useState(false);
  const [newCompAddr, setNewCompAddr] = useState('');
  const [newCompSoldDate, setNewCompSoldDate] = useState('');
  const [newCompSoldPrice, setNewCompSoldPrice] = useState('');
  const [newCompBeds, setNewCompBeds] = useState('');
  const [newCompSource, setNewCompSource] = useState('Rightmove');
  const [newCompNotes, setNewCompNotes] = useState('');

  // Feature 5: Companies House API
  const [settingsIntegrations, setSettingsIntegrations] = useState({ companiesHouse: localStorage.getItem('ch_api_key') || '' });
  const [chQuery, setChQuery] = useState('');
  const [chResults, setChResults] = useState(null);
  const [chLoading, setChLoading] = useState(false);

  // Refurb Tracker state
  const [refurbPropertyId, setRefurbPropertyId] = useState(null);
  const [newRefurbArea, setNewRefurbArea] = useState('');
  const [newRefurbDesc, setNewRefurbDesc] = useState('');
  const [newRefurbContactId, setNewRefurbContactId] = useState('');
  const [newRefurbEstimated, setNewRefurbEstimated] = useState('');
  const [newRefurbActual, setNewRefurbActual] = useState('');
  const [newRefurbStatus, setNewRefurbStatus] = useState('Not Started');
  const [newRefurbNotes, setNewRefurbNotes] = useState('');

  // Activity Log state
  const [showActivityLog, setShowActivityLog] = useState(false);

  // Land Registry state
  const [lrPostcode, setLrPostcode] = useState('');
  const [lrResults, setLrResults] = useState(null);
  const [lrLoading, setLrLoading] = useState(false);
  const [showLrPanel, setShowLrPanel] = useState(false);

  // EPC state
  const [epcQuery, setEpcQuery] = useState('');
  const [epcResult, setEpcResult] = useState(null);
  const [epcLoading, setEpcLoading] = useState(false);
  const [epcError, setEpcError] = useState(null);
  const [showEpcPanel, setShowEpcPanel] = useState(false);

  // Intelligence state
  const [intelligenceRunning, setIntelligenceRunning] = useState(false);
  const [duplicateModal, setDuplicateModal] = useState(null); // { matches, pendingAnalytics, pendingFileRecord }

  // Calendar integration state
  const [calendarStatus, setCalendarStatus] = useState({ google: false, microsoft: false });
  const [calendarToast, setCalendarToast] = useState(null);
  const [calendarAdding, setCalendarAdding] = useState(null);

  // KV persistence — declared here so all state vars above are in scope
  const [saveStatus, setSaveStatus] = useState('idle');
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('crm_session');
    if (!token) { setDataLoaded(true); return; }
    fetch('/api/crm-data', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data) {
          const d = data.data;
          if (d.properties?.length) setProperties(d.properties);
          if (d.companies?.length) setCompanies(d.companies);
          if (d.contacts?.length) setContacts(d.contacts);
          if (d.surveyors?.length) setSurveyors(d.surveyors);
          if (d.watchlist?.length) setWatchlist(d.watchlist);
          if (d.scrapedAuctions?.length) setScrapedAuctions(d.scrapedAuctions);
          if (d.globalNotes?.length) setGlobalNotes(d.globalNotes);
          if (d.tasks?.length) setTasks(d.tasks);
        }
      })
      .catch(() => {})
      .finally(() => setDataLoaded(true));
  }, []);

  useEffect(() => {
    if (!dataLoaded) return;
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      fetch('/api/crm-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ properties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }),
      })
        .then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); })
        .catch(() => setSaveStatus('idle'));
    }, 2000);
    return () => clearTimeout(timer);
  }, [properties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, dataLoaded]);

  // Load notification preferences from server on mount
  useEffect(() => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    fetch('/api/notify/settings', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.success) setSettingsNotifications(data.prefs); })
      .catch(() => {});
  }, []);

  // Auto-reparse report when a property with a stored HTML report is missing GDV matrices
  useEffect(() => {
    if (!currentViewProperty) return;
    const an = currentViewProperty.analytics || {};
    const reportRecord = currentViewProperty.files?.mainReport;
    const hasReport = reportRecord?.key && (reportRecord.type === 'html' || reportRecord.name?.match(/\.html?$/i));
    const missingMatrices = !an.matrixConservative && !an.matrixBase && !an.matrixOptimistic;
    if (!hasReport || !missingMatrices) return;
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    fetch(`/api/documents/${reportRecord.key}`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.text() : null)
      .then(html => {
        if (!html) return;
        const freshAnalytics = parseFullReportAnalytics(html);
        if (!freshAnalytics) return;
        // Merge fresh analytics over existing (keep any manually set fields)
        const merged = { ...an, ...freshAnalytics };
        updateFieldInView('analytics', merged);
      })
      .catch(() => {});
  }, [currentViewProperty?.id]);

  const saveNotifSettings = async (prefs) => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    setNotifSaving(true);
    try {
      const res = await fetch('/api/notify/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(prefs),
      });
      const data = await res.json();
      if (data.success) { setSettingsNotifications(data.prefs); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500); }
    } catch {}
    setNotifSaving(false);
  };

  const loadAllUserNotifSettings = async () => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    setAllUserNotifLoading(true);
    try {
      const res = await fetch('/api/notify/settings/all', { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await res.json();
      if (data.success) setAllUserNotifSettings(data.users);
    } catch {}
    setAllUserNotifLoading(false);
  };

  const saveUserNotifSettings = async (userId, prefs) => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    setUserNotifSaving(p => ({ ...p, [userId]: true }));
    try {
      const res = await fetch('/api/notify/settings/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, prefs }),
      });
      const data = await res.json();
      if (data.success) {
        setAllUserNotifSettings(prev => prev.map(u => u.id === userId ? { ...u, prefs: data.prefs } : u));
        setUserNotifSaved(p => ({ ...p, [userId]: true }));
        setTimeout(() => setUserNotifSaved(p => ({ ...p, [userId]: false })), 2500);
      }
    } catch {}
    setUserNotifSaving(p => ({ ...p, [userId]: false }));
  };

  const fireNotif = async (endpoint, body) => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
    } catch {}
  };

  // Load calendar connection status on mount
  useEffect(() => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    Promise.all([
      fetch('/api/calendar/google/status', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
      fetch('/api/calendar/microsoft/status', { headers: { 'Authorization': `Bearer ${token}` } }).then(r => r.json()),
    ]).then(([g, m]) => {
      setCalendarStatus({ google: !!g.connected, microsoft: !!m.connected });
    }).catch(() => {});
  }, []);

  // Handle OAuth callback redirect (?calendar=google&connected=true)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.get('calendar');
    const connected = params.get('connected');
    const error = params.get('error');
    if (!provider) return;
    window.history.replaceState({}, '', '/');
    if (connected === 'true') {
      setCalendarStatus(prev => ({ ...prev, [provider]: true }));
      setCalendarToast({ type: 'success', message: `${provider === 'google' ? 'Google Calendar' : 'Outlook'} connected successfully!` });
    } else if (error) {
      const msgs = {
        cancelled: 'Connection cancelled.',
        session_expired: 'Session expired — please log in again.',
        token_exchange: 'Could not exchange authorisation code. Check your OAuth redirect URI matches exactly.',
        server_error: 'Server error during connection.',
      };
      setCalendarToast({ type: 'error', message: msgs[error] || `Connection failed: ${error}` });
    }
    const t = setTimeout(() => setCalendarToast(null), 7000);
    return () => clearTimeout(t);
  }, []);

  const addToCalendar = async (provider, property) => {
    const token = localStorage.getItem('crm_session');
    const name = provider === 'google' ? 'Google Calendar' : 'Outlook';
    if (!token) return;
    setCalendarAdding(provider);
    try {
      const res = await fetch(`/api/calendar/${provider}/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          title: `Auction: ${property.address}`,
          date: property.auctionDate,
          time: property.auctionTime ? property.auctionTime.replace(/\s*(am|pm)/i, '').padStart(5, '0') : null,
          duration: 120,
          description: `Guide price: £${(property.guidePrice || 0).toLocaleString()}\nMax bid: £${(property.maxBid || 0).toLocaleString()}\nPlatform: ${property.sourcePlatform || ''}${property.listingUrl ? `\nListing: ${property.listingUrl}` : ''}`,
          location: property.address,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCalendarToast({ type: 'success', message: `Added to ${name}!${data.htmlLink || data.webLink ? ' Click to view.' : ''}`, link: data.htmlLink || data.webLink });
      } else {
        setCalendarToast({ type: 'error', message: `${name}: ${data.message}` });
      }
    } catch {
      setCalendarToast({ type: 'error', message: `Could not reach ${name}.` });
    } finally {
      setCalendarAdding(null);
      setTimeout(() => setCalendarToast(null), 7000);
    }
  };

  const disconnectCalendar = async (provider) => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    try {
      await fetch(`/api/calendar/${provider}/disconnect`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
      setCalendarStatus(prev => ({ ...prev, [provider]: false }));
      setCalendarToast({ type: 'success', message: `${provider === 'google' ? 'Google Calendar' : 'Outlook'} disconnected.` });
      setTimeout(() => setCalendarToast(null), 4000);
    } catch {}
  };

  // Compile Pinned Tasks Dashboard Deck
  const dashboardBookmarkedTasks = [];
  properties.forEach(p => p.notesList.forEach(n => { if (n.bookmarked) dashboardBookmarkedTasks.push({ ...n, propertyId: p.id, propName: p.address.split(',')[0], fullPropertyRef: p, originType: 'Property' }); }));
  globalNotes.forEach(n => { if (n.bookmarked) dashboardBookmarkedTasks.push({ ...n, id: `global-${n.id}`, done: n.done, text: n.text, date: n.date, author: n.author, originType: n.targetType.toUpperCase(), propName: n.targetType === 'company' ? companies.find(c => c.id === n.targetId)?.name : contacts.find(c => c.id === n.targetId)?.name }); });

  const totalDeals = properties.length;
  const considerationCount = properties.filter(p => p.isConsideration).length;
  const strongBidCount = properties.filter(p => p.isStrongBid).length;
  const unreviewedScrapedCount = scrapedAuctions.filter(s => !s.reviewed).length;

  const filteredCompanies = companies.filter(c => {
    if (companySearchType !== 'ALL' && c.type !== companySearchType) return false;
    if (companySearchQuery && companySearchQuery.trim() !== '') {
      return c.name.toLowerCase().includes(companySearchQuery.toLowerCase());
    }
    return true;
  });

  const filteredContacts = contacts.filter(con => {
    if (contactSearchQuery && contactSearchQuery.trim() !== '') {
      return con.name.toLowerCase().includes(contactSearchQuery.toLowerCase());
    }
    return true;
  });

  const filteredProperties = properties.filter(p => {
    if (filterSource !== 'ALL' && p.sourcePlatform !== filterSource) return false;
    if (filterType !== 'ALL' && p.propertyType !== filterType) return false;
    if (filterBedrooms !== 'ALL' && p.bedrooms !== parseInt(filterBedrooms)) return false;
    if (filterMaxGuide !== '' && p.guidePrice > parseFloat(filterMaxGuide)) return false;
    if (filterRecommendation !== 'ALL') {
      if (filterRecommendation === 'strong' && !p.isStrongBid) return false;
      if (filterRecommendation === 'neutral' && p.isStrongBid) return false;
    }
    return true;
  });

  // Pipeline-specific filtered + sorted properties
  const pipelineProperties = properties.filter(p => {
    if (pipelineTypeFilter !== 'ALL' && p.propertyType !== pipelineTypeFilter) return false;
    if (pipelineStageFilter !== 'ALL' && normaliseStatus(p.status) !== pipelineStageFilter) return false;
    if (pipelineDateFrom && p.auctionDate && p.auctionDate < pipelineDateFrom) return false;
    if (pipelineDateTo && p.auctionDate && p.auctionDate > pipelineDateTo) return false;
    return true;
  }).sort((a, b) => {
    if (pipelineSort === 'newest') return b.id - a.id;
    if (pipelineSort === 'priceAsc') return (a.guidePrice || 0) - (b.guidePrice || 0);
    if (pipelineSort === 'priceDesc') return (b.guidePrice || 0) - (a.guidePrice || 0);
    if (pipelineSort === 'dateAsc') return (a.auctionDate || '').localeCompare(b.auctionDate || '');
    if (pipelineSort === 'dateDesc') return (b.auctionDate || '').localeCompare(a.auctionDate || '');
    return 0;
  });

  const RESPONSIVE_CSS = `
    *, *::before, *::after { box-sizing: border-box; }
    body { -webkit-text-size-adjust: 100%; }
    input, select, textarea, button { font-family: inherit; touch-action: manipulation; }
    /* Touch targets */
    button { min-height: 36px; }
    /* Prevent table overflow */
    .crm-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    /* Card grid responsive */
    .crm-grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 14px; }
    .crm-grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 14px; }
    .crm-grid-2 { display: grid; grid-template-columns: repeat(2,1fr); gap: 14px; }
    .crm-kpi-6  { display: grid; grid-template-columns: repeat(6,1fr); gap: 7px; }
    @media (max-width: 1023px) {
      .crm-grid-4 { grid-template-columns: repeat(2,1fr); }
      .crm-grid-3 { grid-template-columns: repeat(2,1fr); }
      .crm-kpi-6  { grid-template-columns: repeat(3,1fr); }
    }
    @media (max-width: 767px) {
      .crm-grid-4 { grid-template-columns: repeat(2,1fr); gap: 10px; }
      .crm-grid-3 { grid-template-columns: 1fr; }
      .crm-grid-2 { grid-template-columns: 1fr; }
      .crm-kpi-6  { grid-template-columns: repeat(2,1fr); gap: 6px; }
      /* Table → card */
      .crm-mobile-cards table, .crm-mobile-cards thead, .crm-mobile-cards tbody,
      .crm-mobile-cards th, .crm-mobile-cards td, .crm-mobile-cards tr { display: block; }
      .crm-mobile-cards thead tr { position: absolute; top: -9999px; left: -9999px; }
      .crm-mobile-cards tr { border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; padding: 4px 0; background: #fff; }
      .crm-mobile-cards td { border: none; border-bottom: 1px solid #f1f5f9; padding: 8px 14px; font-size: 13px; display: flex; justify-content: space-between; align-items: center; }
      .crm-mobile-cards td:before { content: attr(data-label); font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: .06em; }
      .crm-mobile-cards td:last-child { border-bottom: none; }
      /* Horizontal pill nav for mobile tabs */
      .crm-mobile-tab-scroll { display: flex; overflow-x: auto; gap: 0; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
      .crm-mobile-tab-scroll::-webkit-scrollbar { display: none; }
    }
    @media (min-width: 1920px) {
      .crm-ultrawide { max-width: 1800px; margin: 0 auto; }
    }
  `;

  const navBtnStyle = (tabKey, activeColor = '#059669') => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: sidebarCollapsed ? '0' : '12px',
    padding: sidebarCollapsed ? '14px 0' : '14px 16px',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    fontWeight: '500',
    backgroundColor: activeTab === tabKey ? activeColor : 'transparent',
    color: activeTab === tabKey ? '#ffffff' : '#94a3b8',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', margin: 0, padding: 0, fontFamily: 'sans-serif', backgroundColor: '#f8fafc', flexDirection: isMobile ? 'column' : 'row' }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Mobile top bar */}
      {isMobile && (
        <header style={{ height: '52px', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0, zIndex: 200, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Building2 size={20} style={{ color: '#10b981' }} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>A&A Partners</span>
          </div>
          <button
            onClick={() => setMobileMenuOpen(o => !o)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '8px', display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Menu"
          >
            {mobileMenuOpen
              ? <X size={22} color="#fff" />
              : <><span style={{ display: 'block', width: '22px', height: '2px', background: '#94a3b8', borderRadius: '2px' }} /><span style={{ display: 'block', width: '22px', height: '2px', background: '#94a3b8', borderRadius: '2px' }} /><span style={{ display: 'block', width: '22px', height: '2px', background: '#94a3b8', borderRadius: '2px' }} /></>
            }
          </button>
        </header>
      )}

      {/* Mobile nav overlay */}
      {isMobile && mobileMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 190, background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Calendar toast notification */}
      {calendarToast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, padding: '14px 18px', borderRadius: '10px', backgroundColor: calendarToast.type === 'success' ? '#f0fdf4' : '#fef2f2', border: `1px solid ${calendarToast.type === 'success' ? '#a7f3d0' : '#fca5a5'}`, color: calendarToast.type === 'success' ? '#065f46' : '#991b1b', fontSize: '13px', fontWeight: '600', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: '10px', maxWidth: '340px' }}>
          <span>{calendarToast.type === 'success' ? '✅' : '❌'}</span>
          <span style={{ flex: 1 }}>{calendarToast.message}</span>
          {calendarToast.link && <a href={calendarToast.link} target="_blank" rel="noreferrer" style={{ color: '#059669', textDecoration: 'underline', fontSize: '12px', whiteSpace: 'nowrap' }}>Open ↗</a>}
          <button onClick={() => setCalendarToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px', lineHeight: 1, padding: 0, opacity: 0.6 }}>×</button>
        </div>
      )}

      {/* MENU SIDEBAR BAR OVERVIEW CONTROLS */}
      <aside style={{
        width: isMobile ? '260px' : sidebarCollapsed ? '60px' : '260px',
        backgroundColor: '#0f172a',
        color: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 200,
        transition: 'transform 0.25s ease, width 0.2s ease',
        overflow: 'hidden',
        flexShrink: 0,
        ...(isMobile ? {
          position: 'fixed',
          top: '52px',
          left: 0,
          bottom: 0,
          height: 'calc(100% - 52px)',
          transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
        } : isTablet ? {
          position: 'relative',
        } : {}),
      }}>
        <div style={{ padding: sidebarCollapsed ? '24px 0' : '24px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: '10px' }}>
          <Building2 size={24} style={{ color: '#10b981', flexShrink: 0 }} />
          {!sidebarCollapsed && <span style={{ fontSize: '18px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>A&A Partners CRM</span>}
        </div>
        <nav style={{ padding: sidebarCollapsed ? '20px 4px' : '20px 12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          {(() => {
            const isAdmin = user.role === 'Admin';
            const allowed = isAdmin ? null : (user.allowedTabs || []);
            const can = (tab) => isAdmin || allowed.includes(tab);
            const go = (tab) => { setActiveTab(tab); setCurrentViewProperty(null); setCurrentViewCompany(null); setCurrentViewContact(null); setMobileMenuOpen(false); };
            return (
              <>
                {can('dashboard') && <button onClick={() => go('dashboard')} style={navBtnStyle('dashboard')}><LayoutDashboard size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Dashboard</span>}</button>}
                {can('pipeline') && <button onClick={() => go('pipeline')} style={navBtnStyle('pipeline')}><MapPin size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Pipeline</span>}</button>}
                {can('scraper') && <button onClick={() => go('scraper')} style={navBtnStyle('scraper')}><Calendar size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Review {unreviewedScrapedCount > 0 && <span style={{ marginLeft: '4px', background: '#f87171', color: '#fff', borderRadius: '8px', fontSize: '10px', padding: '1px 5px' }}>{unreviewedScrapedCount}</span>}</span>}</button>}
                {can('surveyors') && <button onClick={() => go('surveyors')} style={navBtnStyle('surveyors')}><ClipboardList size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Surveyor Intel</span>}</button>}
                {can('auctionintel') && <button onClick={() => go('auctionintel')} style={navBtnStyle('auctionintel')}><TrendingUp size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Intel</span>}</button>}
                {can('dealanalysis') && <button onClick={() => go('dealanalysis')} style={navBtnStyle('dealanalysis', '#7C3AED')}><BarChart2 size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Deal Analysis</span>}</button>}
                <div style={{ margin: '12px 0', borderTop: '1px solid #1e293b', paddingTop: '12px' }}>
                  {can('companies') && <button onClick={() => go('companies')} style={{ ...navBtnStyle('companies', '#0284c7'), color: '#ffffff' }}><Briefcase size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Companies</span>}</button>}
                  {can('contacts') && <button onClick={() => go('contacts')} style={{ ...navBtnStyle('contacts', '#0284c7'), color: '#ffffff' }}><Contact size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Contacts</span>}</button>}
                  {can('tasks') && <button onClick={() => go('tasks')} style={{ ...navBtnStyle('tasks', '#d97706'), color: '#ffffff' }}><ClipboardList size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Tasks</span>}</button>}
                </div>
              </>
            );
          })()}
        </nav>
        <div style={{ padding: sidebarCollapsed ? '12px 4px' : '12px', borderTop: '1px solid #1e293b' }}>
          {!isMobile && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px', border: 'none', backgroundColor: '#1e293b', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px', marginBottom: '8px' }}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>}
          <button onClick={() => { setActiveTab('settings'); setCurrentViewProperty(null); setCurrentViewCompany(null); setCurrentViewContact(null); setMobileMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: (sidebarCollapsed && !isMobile) ? '0' : '12px', padding: (sidebarCollapsed && !isMobile) ? '14px 0' : '14px 16px', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '14px', fontWeight: '500', backgroundColor: activeTab === 'settings' ? '#334155' : 'transparent', color: activeTab === 'settings' ? '#ffffff' : '#94a3b8' }}>
            <Settings size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Settings</span>}
          </button>
          <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: (sidebarCollapsed && !isMobile) ? '0' : '12px', padding: (sidebarCollapsed && !isMobile) ? '10px 0' : '10px 16px', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '14px' }}>
            <LogOut size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Log Out</span>}
          </button>
        </div>
      </aside>

      {/* CORE DISPLAY WORKSPACE SHELL */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        
        {currentViewProperty && !currentViewCompany && !currentViewContact ? (
          // ==================== UNABRIDGED PROPERTY CANVAS CONTROLLER ====================
          (() => { try {
            const an = currentViewProperty.analytics || {};
            const st = normaliseStatus(currentViewProperty.status);
            const aDate = currentViewProperty.auctionDate ? new Date(currentViewProperty.auctionDate) : null;
            const daysLeft = aDate ? Math.ceil((aDate - new Date()) / 86400000) : null;
            const gp = currentViewProperty.guidePrice || 0;
            const maxBid = parseFloat(an.maxBid) || currentViewProperty.maxBid || 0;
            const netProfit = parseFloat(an.netProfit) || 0;
            const margin = an.profitMargin != null ? parseFloat(an.profitMargin) : an.margin != null ? parseFloat(an.margin) : null;
            const walkBid = parseFloat(an.walkBid) || 0;
            const targetBid = parseFloat(an.targetBid) || 0;
            const stretchBid = parseFloat(an.stretchBid) || 0;
            const consGDV = parseFloat(an.gdvConservative || an.conservativeGDV) || 0;
            const baseGDV = parseFloat(an.gdvBase) || 0;
            const maxGDV = parseFloat(an.gdvOptimistic || an.maxGDV) || 0;
            const MAIN_STAGES = ['Sourced', 'Appraising', 'Approved', 'Due Diligence', 'Bidding'];
            const stIdx = MAIN_STAGES.indexOf(st);
            const fmtNum = v => v ? `£${Number(Math.round(v)).toLocaleString()}` : '—';
            const fmtK = v => v ? `£${(v / 1000).toFixed(0)}k` : null;
            const propFiles = currentViewProperty.files || {};
            const FILE_KEYS = [
              { key: 'mainReport', label: 'Assessment report', accept: '.html,.htm,.pdf' },
              { key: 'sprift', label: 'Sprift report', accept: '.html,.htm,.pdf' },
              { key: 'legalPack', label: 'Legal pack', accept: '.pdf,.zip,.doc,.docx' },
              { key: 'surveyReport', label: 'Survey report', accept: '.pdf' },
            ];
            const surveyJobs = currentViewProperty.surveyJobs || [];
            const latestJob = surveyJobs[surveyJobs.length - 1];
            const actLog = currentViewProperty.activityLog || [];
            const AICONS = { created: '🆕', stage: '🔀', note: '📝', document: '📄', survey: '📋', intelligence: '🔍' };
            const propPostcode = currentViewProperty.postcode || extractPostcode(currentViewProperty.address || '') || extractPostcode(currentViewProperty.dealName || '');
            const intel = currentViewProperty.intelligence || {};
            const intelConflicts = currentViewProperty.intelligenceConflicts || [];
            const fmtAt = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
            const dc2 = currentViewProperty.dealCalc || {};
            const pp2 = parseFloat(dc2.purchasePrice) || 0;
            const acqFees = pp2 > 0 ? (pp2 * (parseFloat(dc2.buyersPremium) || 0) / 100) + (parseFloat(dc2.adminFee) || 0) + (parseFloat(dc2.legalFees) || 0) + (parseFloat(dc2.surveyCost) || 0) + calcSDLT(pp2, true) : 0;
            const refurbCost = parseFloat(dc2.refurbCost) || 0;
            const holdingCost = (parseFloat(dc2.holdingMonths) || 0) * (parseFloat(dc2.holdingMonthlyCost) || 0);
            const contingency = refurbCost * ((parseFloat(dc2.contingencyPct) ?? 10) / 100);
            const costTotal = pp2 + acqFees + refurbCost + holdingCost + contingency;
            return (
              <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>

                {/* ════════════════════════════════════
                    INTELLIGENCE SIDEBAR
                ════════════════════════════════════ */}
                {/* Mobile: overlay toggle strip */}
                {isMobile && (
                  <div style={{ background: '#0f172a', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, borderBottom: '1px solid #1e293b' }}>
                    <button onClick={() => setCurrentViewProperty(null)} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <ArrowLeft size={13} /> Pipeline
                    </button>
                    <span style={{ fontSize: '13px', fontWeight: '500', color: '#f1f5f9', flex: 1, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '0 12px' }}>
                      {currentViewProperty.dealName || currentViewProperty.address}
                    </span>
                    <button onClick={() => setPropSidebarOpen(o => !o)} style={{ background: '#1e293b', border: 'none', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', padding: '6px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <SlidersHorizontal size={13} /> {propSidebarOpen ? 'Hide' : 'Details'}
                    </button>
                  </div>
                )}
                <div style={{ width: isMobile ? '100%' : '260px', minWidth: isMobile ? 'auto' : '260px', background: '#0f172a', display: isMobile ? (propSidebarOpen ? 'flex' : 'none') : 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0, maxHeight: isMobile ? '50vh' : 'none' }}>

                  {/* Back + title */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #1e293b' }}>
                    {!isMobile && <button onClick={() => setCurrentViewProperty(null)} style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#64748b', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '10px', padding: 0, fontFamily: 'inherit' }}>
                      <ArrowLeft size={12} /> Pipeline
                    </button>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                      <input
                        type="text"
                        value={currentViewProperty.dealName || ''}
                        onChange={e => {
                          const val = e.target.value;
                          const pcMatch = val.match(/\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i);
                          if (pcMatch) {
                            const cleanName = val.replace(pcMatch[0], '').replace(/,\s*$/, '').trim();
                            const pc = pcMatch[1].toUpperCase().replace(/\s+/, ' ');
                            const updated = { ...currentViewProperty, dealName: cleanName, postcode: currentViewProperty.postcode || pc };
                            setCurrentViewProperty(updated);
                            setProperties(properties.map(p => p.id === currentViewProperty.id ? updated : p));
                          } else {
                            updateFieldInView('dealName', val);
                          }
                        }}
                        placeholder={currentViewProperty.address || 'Deal name…'}
                        style={{ fontSize: '13px', fontWeight: '500', color: '#f1f5f9', background: 'transparent', border: 'none', borderBottom: '1px dashed #475569', outline: 'none', flex: 1, padding: '0 0 2px 0', fontFamily: 'inherit' }}
                      />
                      <Pencil size={10} color="#475569" style={{ flexShrink: 0 }} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <input
                        type="text"
                        value={currentViewProperty.postcode || ''}
                        onChange={e => updateFieldInView('postcode', e.target.value.toUpperCase())}
                        placeholder="Postcode e.g. S6 2AB"
                        style={{ fontSize: '11px', color: propPostcode ? '#86efac' : '#94a3b8', background: 'transparent', border: 'none', borderBottom: `1px dashed ${propPostcode ? '#34d399' : '#475569'}`, outline: 'none', width: '110px', padding: '0 0 1px 0', fontFamily: 'inherit', letterSpacing: '0.05em' }}
                      />
                      {!propPostcode && <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: '600' }}>REQUIRED FOR ENRICHMENT</span>}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                      {[currentViewProperty.bedrooms && `${currentViewProperty.bedrooms}-bed`, currentViewProperty.propertyType, currentViewProperty.sourcePlatform].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {an.bidStrength === 'Strong' && <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', background: '#052e16', color: '#86efac' }}>Strong bid</span>}
                      {an.bidStrength === 'Conservative' && <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', background: '#451a03', color: '#fcd34d' }}>Conservative</span>}
                      {an.bidStrength === 'Weak' && <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', background: '#3f1515', color: '#fca5a5' }}>Weak bid</span>}
                      {currentViewProperty.planningToBid && <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '10px', background: '#1e3a5f', color: '#93c5fd' }}>Planning to bid</span>}
                    </div>
                  </div>

                  {/* Pipeline status pills */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '7px' }}>Pipeline stage</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {MAIN_STAGES.map(s => (
                        <button key={s} onClick={() => updateFieldInView('status', s)} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: st === s ? '#1e3a5f' : 'transparent', borderColor: st === s ? '#3b82f6' : '#334155', color: st === s ? '#93c5fd' : '#64748b' }}>{s}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: '9px', color: '#475569', margin: '8px 0 5px' }}>Auction outcome</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[
                        { s: 'Exchanged', sel: { bg: '#052e16', bc: '#4ade80', tc: '#86efac' } },
                        { s: 'Outbid', sel: { bg: '#3f1515', bc: '#f87171', tc: '#fca5a5' } },
                        { s: 'No Bid', sel: { bg: '#1e293b', bc: '#94a3b8', tc: '#cbd5e1' } },
                        { s: 'Tracked', sel: { bg: '#1e293b', bc: '#94a3b8', tc: '#cbd5e1' } },
                      ].map(({ s, sel }) => {
                        const active = st === s;
                        return <button key={s} onClick={() => updateFieldInView('status', s)} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: active ? sel.bg : 'transparent', borderColor: active ? sel.bc : '#334155', color: active ? sel.tc : '#64748b' }}>{s}</button>;
                      })}
                    </div>
                  </div>

                  {/* Deal score */}
                  {an.bidStrength && (() => {
                    const score = an.bidStrength === 'Strong' ? 78 : an.bidStrength === 'Conservative' ? 52 : 34;
                    const sc = an.bidStrength === 'Strong' ? '#4ade80' : an.bidStrength === 'Conservative' ? '#fbbf24' : '#f87171';
                    return (
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#1e293b', border: `1px solid ${sc}22`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ fontSize: '20px', fontWeight: '500', color: sc, lineHeight: 1 }}>{score}</div>
                          <div style={{ fontSize: '8px', color: '#475569' }}>/ 100</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '500', color: '#f1f5f9', marginBottom: '5px' }}>{an.bidStrength} deal</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {netProfit > 0 && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '500', background: '#052e16', color: '#86efac' }}>£{(netProfit / 1000).toFixed(0)}k profit</span>}
                            {an.comps && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '500', background: '#1e293b', color: '#64748b' }}>{an.comps} comps</span>}
                            {an.epcRating && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '500', background: '#451a03', color: '#fcd34d' }}>EPC {an.epcRating}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bid strategy */}
                  {(walkBid || targetBid || stretchBid) ? (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Bid strategy</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '5px' }}>
                        {[
                          { l: 'Walk', v: walkBid, bg: '#1a2234', bc: '#334155', lc: '#94a3b8', vc: '#e2e8f0' },
                          { l: 'Target', v: targetBid, bg: '#052e16', bc: '#166534', lc: '#86efac', vc: '#4ade80' },
                          { l: 'Stretch', v: stretchBid || maxBid, bg: '#451a03', bc: '#854d0e', lc: '#fcd34d', vc: '#fbbf24' },
                        ].filter(b => b.v > 0).map(b => (
                          <div key={b.l} style={{ borderRadius: '6px', padding: '7px 5px', textAlign: 'center', border: `0.5px solid ${b.bc}`, background: b.bg }}>
                            <div style={{ fontSize: '8px', textTransform: 'uppercase', letterSpacing: '.04em', color: b.lc, marginBottom: '2px', opacity: 0.8 }}>{b.l}</div>
                            <div style={{ fontSize: '11px', fontWeight: '500', color: b.vc }}>{fmtK(b.v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Key financials — guide price & max bid are editable, rest from report */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Key financials</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                      <span style={{ color: '#64748b' }}>Guide price</span>
                      <input type="number" value={currentViewProperty.guidePrice || ''} onChange={e => updateFieldInView('guidePrice', parseInt(e.target.value) || 0)} placeholder="—" style={{ width: '90px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#f1f5f9', fontWeight: '500', fontSize: '11px', textAlign: 'right', outline: 'none', fontFamily: 'inherit', padding: '1px 0' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                      <span style={{ color: '#64748b' }}>Max bid</span>
                      <input type="number" value={currentViewProperty.maxBid || ''} onChange={e => updateFieldInView('maxBid', parseInt(e.target.value) || 0)} placeholder="—" style={{ width: '90px', background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#4ade80', fontWeight: '500', fontSize: '11px', textAlign: 'right', outline: 'none', fontFamily: 'inherit', padding: '1px 0' }} />
                    </div>
                    {[
                      { l: 'Net profit', v: netProfit ? fmtNum(netProfit) : '—', c: '#4ade80' },
                      { l: 'Margin', v: margin != null ? `${margin.toFixed(1)}%` : '—', c: margin >= 20 ? '#4ade80' : margin >= 10 ? '#fbbf24' : margin != null ? '#f87171' : undefined },
                      { l: 'GDV base', v: baseGDV ? fmtNum(baseGDV) : '—' },
                    ].map(r => (
                      <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                        <span style={{ color: '#64748b' }}>{r.l}</span>
                        <span style={{ fontWeight: '500', color: r.c || '#94a3b8' }}>{r.v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Auction details — editable */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Auction details</div>
                    {[
                      { l: 'Date', field: 'auctionDate', type: 'date' },
                      { l: 'Time', field: 'auctionTime', type: 'time' },
                    ].map(f => (
                      <div key={f.field} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                        <span style={{ color: '#64748b' }}>{f.l}</span>
                        <input type={f.type} value={currentViewProperty[f.field] || ''} onChange={e => updateFieldInView(f.field, e.target.value)} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#f1f5f9', fontSize: '10px', outline: 'none', fontFamily: 'inherit', padding: '1px 0', textAlign: 'right', colorScheme: 'dark' }} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '11px' }}>
                      <span style={{ color: '#64748b' }}>Platform</span>
                      <select value={currentViewProperty.sourcePlatform || ''} onChange={e => updateFieldInView('sourcePlatform', e.target.value)} style={{ background: 'transparent', border: 'none', borderBottom: '1px solid #334155', color: '#f1f5f9', fontSize: '10px', outline: 'none', fontFamily: 'inherit', maxWidth: '120px', cursor: 'pointer', colorScheme: 'dark' }}>
                        <option value="">— select —</option>
                        {companies.filter(c => c.type === 'Auction House').map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                        {currentViewProperty.sourcePlatform && !companies.filter(c => c.type === 'Auction House').some(c => c.name === currentViewProperty.sourcePlatform) && <option value={currentViewProperty.sourcePlatform}>{currentViewProperty.sourcePlatform}</option>}
                      </select>
                    </div>
                  </div>

                  {/* Intel quick view */}
                  {(an.epcRating || an.floorArea || an.comps || daysLeft != null) && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Intel quick view</div>
                      {[
                        an.epcRating && { l: 'EPC', v: `${an.epcRating} rating`, c: '#fbbf24' },
                        an.floorArea && { l: 'Floor area', v: `${an.floorArea} sqm` },
                        an.comps && { l: 'Comparables', v: `${an.comps} sales` },
                        { l: 'Survey', v: surveyJobs.length > 0 ? (latestJob?.dateReceived ? 'Report received' : 'Booked') : 'Not booked', c: surveyJobs.length > 0 ? (latestJob?.dateReceived ? '#4ade80' : '#fbbf24') : '#475569' },
                        daysLeft != null && { l: 'Days to auction', v: daysLeft > 0 ? `${daysLeft} days` : daysLeft === 0 ? 'Today!' : 'Passed', c: daysLeft <= 3 && daysLeft >= 0 ? '#f87171' : undefined },
                      ].filter(Boolean).map(r => (
                        <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', padding: '4px 0', borderBottom: '0.5px solid #1e293b' }}>
                          <span style={{ color: '#64748b' }}>{r.l}</span>
                          <span style={{ fontWeight: '500', color: r.c || '#e2e8f0' }}>{r.v}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Documents */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Documents</div>
                    {FILE_KEYS.map(({ key, label, accept }) => {
                      const rec = propFiles[key];
                      return (
                        <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                          <span style={{ color: rec ? '#e2e8f0' : '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <FileText size={11} color={rec ? '#4ade80' : '#334155'} /> {label}
                          </span>
                          {rec
                            ? <button onClick={() => handleViewDocument(rec)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '1px', display: 'flex', fontSize: '10px', fontFamily: 'inherit' }}>View</button>
                            : <label style={{ cursor: 'pointer', fontSize: '10px', color: '#475569' }}>
                                Upload
                                <input type="file" accept={accept} style={{ display: 'none' }} onChange={e => handleVaultUpload(e, key)} />
                              </label>
                          }
                        </div>
                      );
                    })}
                  </div>

                  {/* Planning to bid + listing link */}
                  <div style={{ padding: '12px 16px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '11px', color: currentViewProperty.planningToBid ? '#93c5fd' : '#64748b' }}>
                      <input type="checkbox" checked={currentViewProperty.planningToBid || false} onChange={e => updateFieldInView('planningToBid', e.target.checked)} style={{ width: '14px', height: '14px', cursor: 'pointer' }} />
                      Planning to bid
                    </label>
                    {currentViewProperty.listingUrl && (
                      <a href={currentViewProperty.listingUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#64748b', marginTop: '8px', textDecoration: 'none' }}>
                        <ExternalLink size={11} /> View listing
                      </a>
                    )}
                  </div>
                </div>

                {/* ════════════════════════════════════
                    MAIN SCROLL AREA
                ════════════════════════════════════ */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 0 }}>

                  {/* Pipeline status track */}
                  <div style={{ display: 'flex', alignItems: 'center', padding: '9px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc', flexShrink: 0, overflowX: 'auto', gap: 0 }}>
                    {MAIN_STAGES.map((s, i) => {
                      const done = stIdx > i;
                      const cur = st === s;
                      return (
                        <React.Fragment key={s}>
                          <div onClick={() => updateFieldInView('status', s)} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            <div style={{ width: '20px', height: '20px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '500', flexShrink: 0, background: done ? '#059669' : cur ? '#0f172a' : '#ffffff', border: done || cur ? 'none' : '0.5px solid #e2e8f0', color: done || cur ? '#fff' : '#94a3b8' }}>
                              {done ? <Check size={10} /> : i + 1}
                            </div>
                            <span style={{ fontSize: '11px', color: done ? '#059669' : cur ? '#0f172a' : '#94a3b8', fontWeight: cur ? '500' : '400' }}>{s}</span>
                          </div>
                          {i < MAIN_STAGES.length - 1 && <div style={{ flex: 1, minWidth: '12px', height: '1px', background: done ? '#059669' : '#e2e8f0', margin: '0 4px' }} />}
                        </React.Fragment>
                      );
                    })}
                    <div style={{ width: '1px', height: '16px', background: '#e2e8f0', margin: '0 10px', flexShrink: 0 }} />
                    <span style={{ fontSize: '10px', color: '#94a3b8', marginRight: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>Outcome:</span>
                    {[
                      { s: 'Exchanged', sel: { bg: '#f0fdf4', bc: '#059669', tc: '#166534' } },
                      { s: 'Outbid', sel: { bg: '#fffbeb', bc: '#d97706', tc: '#92400e' } },
                      { s: 'No Bid', sel: { bg: '#f8fafc', bc: '#64748b', tc: '#334155' } },
                    ].map(({ s, sel }) => {
                      const active = st === s;
                      return <button key={s} onClick={() => updateFieldInView('status', s)} style={{ padding: '3px 9px', borderRadius: '4px', fontSize: '10px', border: `0.5px solid ${active ? sel.bc : '#e2e8f0'}`, background: active ? sel.bg : '#fff', color: active ? sel.tc : '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', marginLeft: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>{s}</button>;
                    })}
                  </div>

                  {/* Property header */}
                  <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: '500', color: '#0f172a', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentViewProperty.dealName || currentViewProperty.address}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {currentViewProperty.auctionDate && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {currentViewProperty.auctionDate}{currentViewProperty.auctionTime ? ` · ${currentViewProperty.auctionTime}` : ''}</span>}
                        {currentViewProperty.sourcePlatform && <span>{currentViewProperty.sourcePlatform}</span>}
                        {currentViewProperty.address && <span style={{ color: '#94a3b8' }}>{currentViewProperty.address}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => runPropertyIntelligence(currentViewProperty)}
                        disabled={intelligenceRunning || !propPostcode}
                        title={propPostcode ? 'Run public API intelligence for this property' : 'Add a postcode to the address to enable intelligence'}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid', cursor: intelligenceRunning || !propPostcode ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: !propPostcode ? 0.45 : 1, background: intel.lastRun ? '#f0fdf4' : '#fafafa', borderColor: intel.lastRun ? '#86efac' : '#e2e8f0', color: intel.lastRun ? '#166534' : '#475569', fontFamily: 'inherit' }}
                      >
                        {intelligenceRunning ? '⏳ Running…' : intel.lastRun ? '🔍 Refresh Intel' : '🔍 Run Intelligence'}
                      </button>
                      {currentViewProperty.listingUrl && (
                        <a href={currentViewProperty.listingUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#0284c7', padding: '5px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', background: '#eff6ff', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          <ExternalLink size={11} /> Listing
                        </a>
                      )}
                      {daysLeft != null && (
                        <div style={{ background: '#0f172a', color: '#f8fafc', borderRadius: '8px', padding: '8px 14px', textAlign: 'center' }}>
                          <div style={{ fontSize: daysLeft >= 0 ? '24px' : '16px', fontWeight: '500', lineHeight: 1, color: daysLeft <= 3 && daysLeft >= 0 ? '#f87171' : '#f8fafc' }}>{daysLeft >= 0 ? daysLeft : '—'}</div>
                          <div style={{ fontSize: '9px', color: '#64748b', marginTop: '1px' }}>{daysLeft > 0 ? 'days to go' : daysLeft === 0 ? 'today!' : 'passed'}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* KPI strip */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', borderBottom: '0.5px solid #e2e8f0', background: '#f8fafc', flexShrink: 0 }}>
                    {[
                      { l: 'Guide price', v: gp ? fmtNum(gp) : '—', src: 'Listing', vc: '' },
                      { l: 'Max bid', v: maxBid ? fmtNum(maxBid) : '—', src: an.maxBid ? 'Report' : '', vc: maxBid ? '#166534' : '' },
                      { l: 'Net profit', v: netProfit ? fmtNum(netProfit) : '—', src: an.netProfit ? 'Report' : '', vc: netProfit ? '#166534' : '' },
                      { l: 'Margin / ROI', v: margin != null ? `${margin.toFixed(1)}%` : '—', vc: margin >= 20 ? '#166534' : margin >= 10 ? '#92400e' : margin != null ? '#b91c1c' : '' },
                    ].map((k, i) => (
                      <div key={k.l} style={{ padding: '11px 16px', borderRight: i < 3 ? '0.5px solid #e2e8f0' : 'none' }}>
                        <div style={{ fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{k.l}</div>
                        <div style={{ fontSize: '17px', fontWeight: '500', color: k.vc || '#0f172a' }}>{k.v}</div>
                        {k.src && <div style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '3px', background: '#e6f1fb', color: '#0c447c', marginTop: '2px', display: 'inline-block' }}>{k.src}</div>}
                      </div>
                    ))}
                  </div>

                  {/* ══ THE TERMINAL — intel power view ══ */}
                  {intel.lastRun && (() => {
                    const ic = intel.connectors || {};
                    const polD    = ic.police?.data || {};
                    const epcD    = ic.epc?.data || {};
                    const lrD     = ic.landRegistry?.data || {};
                    const osmD    = ic.osm?.data || {};
                    const floodD  = ic.flood?.data || {};
                    const planD   = ic.planning?.data || {};
                    const addrD   = ic.address?.data || {};
                    const imdD    = ic.imd?.data || {};
                    const hpiD    = ic.hpi?.data || {};
                    const tflD    = ic.tfl?.data || {};
                    const schoolD = ic.schools?.data || {};
                    const censD   = ic.census?.data || {};
                    const fmtAge = iso => { const d = new Date(iso); const h = Math.floor((Date.now() - d) / 3600000); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
                    const connCount = Object.values(ic).filter(c => c?.status === 'success').length;
                    const totalConn = Object.keys(ic).length;

                    // Sparkline: prefer local LR comps, fall back to HPI area price history
                    const avgPx  = lrD.avgPrice || 0;
                    const growth = typeof lrD.priceGrowth === 'number' ? lrD.priceGrowth : 0;
                    const hpiHistory = hpiD.priceHistory || [];
                    const useHpiFallback = !avgPx && hpiHistory.length >= 3;
                    let spkPts = [], spkLabel = '', spkGrowth = growth, spkAvg = avgPx;
                    if (avgPx) {
                      spkPts = [
                        avgPx * (1 - growth / 100 * 0.85),
                        avgPx * (1 - growth / 100 * 0.65),
                        avgPx * (1 - growth / 100 * 0.5),
                        avgPx * (1 - growth / 100 * 0.3),
                        avgPx * (1 - growth / 100 * 0.1),
                        avgPx,
                      ];
                      spkLabel = `${lrD.salesCount || 0} Land Registry sales`;
                    } else if (useHpiFallback) {
                      const sorted = [...hpiHistory].sort((a, b) => a.date.localeCompare(b.date));
                      const recent6 = sorted.slice(-6);
                      spkPts = recent6.map(h => h.price);
                      spkAvg = recent6[recent6.length - 1]?.price || 0;
                      const oldest = recent6[0]?.price || spkAvg;
                      spkGrowth = oldest > 0 ? Math.round((spkAvg - oldest) / oldest * 1000) / 10 : 0;
                      spkLabel = `HPI area average · ${hpiD.area || ''}`;
                    }
                    const spkMin = spkPts.length ? Math.min(...spkPts) * 0.98 : 0;
                    const spkMax = spkPts.length ? Math.max(...spkPts) * 1.02 : 1;
                    const toY = v => 60 - ((v - spkMin) / (spkMax - spkMin)) * 54;
                    const spkPolyline = spkPts.map((v, i) => {
                      const x = 10 + i * Math.floor(230 / Math.max(spkPts.length - 1, 1));
                      return `${x},${toY(v).toFixed(1)}`;
                    }).join(' ');
                    const lastX = spkPts.length > 1 ? 10 + (spkPts.length - 1) * Math.floor(230 / Math.max(spkPts.length - 1, 1)) : 240;
                    const lastY = spkPts.length ? toY(spkPts[spkPts.length - 1]) : 0;
                    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun'];

                    const SC = {
                      ok:      { bg: '#EAF3DE', c: '#27500A' },
                      warn:    { bg: '#FAEEDA', c: '#633806' },
                      bad:     { bg: '#FEE2E2', c: '#991B1B' },
                      neutral: { bg: '#F1F5F9', c: '#64748B' },
                    };

                    const roiVal = parseFloat(an.roi) || margin;
                    const hpi1yr = hpiD.growth1yr;
                    const imdDec = imdD.decile;
                    const kpiChips = [
                      { l: 'ROI',     v: an.roi ? `${parseFloat(an.roi).toFixed(1)}%` : margin != null ? `${margin.toFixed(1)}%` : '—', d: an.roi ? 'Return on invest.' : 'Margin', ok: (roiVal || 0) >= 15 ? 'ok' : (roiVal || 0) >= 8 ? 'warn' : roiVal != null ? 'bad' : 'neutral' },
                      { l: 'Risk',    v: polD.riskScore != null ? `${polD.riskScore}/10` : '—', d: polD.riskLabel || 'Crime risk', ok: polD.riskScore != null ? (polD.riskScore <= 4 ? 'ok' : polD.riskScore <= 7 ? 'warn' : 'bad') : 'neutral' },
                      { l: 'Days',    v: daysLeft != null ? String(daysLeft) : '—', d: currentViewProperty.auctionDate || 'Auction', ok: daysLeft != null ? (daysLeft > 14 ? 'ok' : daysLeft > 5 ? 'warn' : 'bad') : 'neutral' },
                      { l: 'EPC',     v: epcD.epcRating || '—', d: epcD.potentialRating ? `→ ${epcD.potentialRating} pot.` : 'Rating', ok: epcD.epcRating ? (['A','B','C'].includes(epcD.epcRating) ? 'ok' : epcD.epcRating === 'D' ? 'warn' : 'bad') : 'neutral' },
                      { l: 'HPI 1yr', v: hpi1yr != null ? `${hpi1yr > 0 ? '+' : ''}${hpi1yr}%` : '—', d: hpiD.area ? hpiD.area.substring(0, 14) : 'Price growth', ok: hpi1yr != null ? (hpi1yr >= 3 ? 'ok' : hpi1yr >= 0 ? 'warn' : 'bad') : 'neutral' },
                      { l: 'IMD',     v: imdDec != null ? `D${imdDec}` : '—', d: imdD.label || 'Deprivation', ok: imdDec != null ? (imdDec >= 7 ? 'ok' : imdDec >= 4 ? 'warn' : 'bad') : 'neutral' },
                      { l: 'Comps',   v: lrD.salesCount != null ? String(lrD.salesCount) : '—', d: lrD.avgPrice ? `£${Math.round(lrD.avgPrice / 1000)}k avg` : 'Sales', ok: (lrD.salesCount || 0) > 5 ? 'ok' : lrD.salesCount != null ? 'warn' : 'neutral' },
                      { l: 'Amenity', v: osmD.amenityScore != null ? `${osmD.amenityScore}/10` : '—', d: osmD.amenityLabel || 'Area score', ok: osmD.amenityScore != null ? (osmD.amenityScore >= 7 ? 'ok' : osmD.amenityScore >= 4 ? 'warn' : 'bad') : 'neutral' },
                    ];

                    const schoolBest = schoolD.bestRating;
                    const schoolOk = schoolBest === 'Outstanding' ? 'ok' : schoolBest === 'Good' ? 'ok' : schoolBest === 'Requires Improvement' ? 'warn' : schoolBest === 'Inadequate' ? 'bad' : 'neutral';
                    const tflScore = tflD.transportScore;
                    const planConstraints = planD.constraintCount ?? (planD.conservationArea || planD.listedBuilding || planD.article4Direction ? 1 : 0);
                    const planOpps = planD.opportunityCount || 0;
                    const planLabel = planD.conservationArea ? 'Conserv. area' : planD.listedBuilding ? `Listed ${planD.listedBuildingGrade || ''}`.trim() : planD.nationalPark ? 'National Park' : planD.aonb ? 'AONB' : planD.sssi ? 'SSSI' : planD.article4Direction ? 'Article 4' : planD.brownfield ? 'Brownfield site' : planConstraints === 0 ? (planOpps > 0 ? `${planOpps} opportunity` : 'No constraints') : `${planConstraints} constraint${planConstraints > 1 ? 's' : ''}`;
                    // Transport: TfL for London, else OSM station distance
                    const stationM = osmD.nearestStationM;
                    const transportV = tflD.inLondon ? (tflScore != null ? `TfL score ${tflScore}/10${tflD.tflZone ? ` · Zone ${tflD.tflZone}` : ''}` : 'London') : stationM != null ? `Station ${stationM < 1000 ? `${stationM}m` : `${(stationM/1000).toFixed(1)}km`}` : ic.osm ? 'No station <2km' : 'Run intel';
                    const transportOk = tflD.inLondon ? (tflScore >= 7 ? 'ok' : tflScore >= 4 ? 'warn' : 'bad') : stationM != null ? (stationM <= 800 ? 'ok' : stationM <= 1600 ? 'warn' : 'bad') : 'neutral';
                    const signals = [
                      { icon: '🚔', l: 'Crime',     v: polD.riskLabel ? `${polD.riskLabel}${polD.monthlyAverage != null ? ` · ${polD.monthlyAverage}/mo` : ''}` : ic.police ? 'No crimes recorded' : 'Run intel', ok: polD.riskScore != null ? (polD.riskScore <= 4 ? 'ok' : polD.riskScore <= 7 ? 'warn' : 'bad') : ic.police ? 'ok' : 'neutral' },
                      { icon: '🌊', l: 'Flood',     v: floodD.hasCurrentWarning ? 'Active warning!' : floodD.floodAreasNearby != null ? (floodD.floodAreasNearby === 0 ? 'None within 0.5km' : `${floodD.floodAreasNearby} area${floodD.floodAreasNearby > 1 ? 's' : ''} nearby`) : ic.flood ? 'No data' : 'Run intel', ok: floodD.hasCurrentWarning ? 'bad' : floodD.floodAreasNearby === 0 ? 'ok' : floodD.floodAreasNearby > 0 ? 'warn' : 'neutral' },
                      { icon: '🏛️', l: 'Planning',  v: ic.planning ? planLabel : 'Run intel', ok: (planD.conservationArea || planD.listedBuilding || planD.article4Direction || planD.nationalPark || planD.aonb || planD.sssi) ? 'warn' : planD.brownfield || planD.enterpriseZone || planD.opportunityArea ? 'ok' : ic.planning ? 'ok' : 'neutral' },
                      { icon: '⚡', l: 'EPC',       v: epcD.epcRating ? `${epcD.epcRating}${epcD.floorArea ? ` · ${epcD.floorArea}sqm` : ''}` : ic.epc ? 'Not found' : 'No EPC key', ok: epcD.epcRating ? (['A','B','C'].includes(epcD.epcRating) ? 'ok' : 'warn') : 'neutral' },
                      { icon: '🏫', l: 'Schools',   v: schoolBest ? `${schoolBest}${schoolD.outstandingCount > 0 ? ` · ${schoolD.outstandingCount} O/S` : ''}` : stationM != null ? (osmD.nearestSchoolM != null ? (osmD.nearestSchoolM < 1000 ? `${osmD.nearestSchoolM}m` : `${(osmD.nearestSchoolM/1000).toFixed(1)}km`) : 'Run intel') : 'Run intel', ok: ic.schools ? schoolOk : osmD.nearestSchoolM != null ? (osmD.nearestSchoolM <= 500 ? 'ok' : osmD.nearestSchoolM <= 1500 ? 'warn' : 'bad') : 'neutral' },
                      { icon: '🏘️', l: 'Amenities', v: osmD.amenityLabel || (ic.osm ? 'No data' : 'Run intel'), d: stationM ? `Stn ${stationM}m` : '', ok: osmD.amenityScore != null ? (osmD.amenityScore >= 7 ? 'ok' : osmD.amenityScore >= 4 ? 'warn' : 'bad') : 'neutral' },
                      { icon: '🚇', l: 'Transport', v: transportV, ok: transportOk },
                      { icon: '📊', l: 'IMD',       v: imdDec != null ? `Decile ${imdDec} · ${imdD.label || ''}` : ic.imd ? 'No data' : 'Run intel', ok: imdDec != null ? (imdDec >= 7 ? 'ok' : imdDec >= 4 ? 'warn' : 'bad') : 'neutral' },
                    ];

                    const mapQ = encodeURIComponent(currentViewProperty.address || currentViewProperty.dealName || '');
                    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY;

                    return (
                      <div style={{ borderBottom: '0.5px solid #e2e8f0', background: '#fafafa', flexShrink: 0 }}>

                        {/* Row 1 — KPI chips */}
                        <div style={{ padding: '9px 16px', borderBottom: '0.5px solid #e2e8f0', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4,1fr)' : 'repeat(8,1fr)', gap: '7px' }}>
                          {kpiChips.map(chip => {
                            const col = SC[chip.ok];
                            return (
                              <div key={chip.l} style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '7px', padding: '7px 9px', textAlign: 'center' }}>
                                <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{chip.l}</div>
                                <div style={{ fontSize: '15px', fontWeight: '500', color: col.c, lineHeight: 1.1 }}>{chip.v}</div>
                                <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.d}</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Row 2 — Map | Sparkline | Intel signals */}
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '1fr 1fr' : '220px 1fr 1fr', borderBottom: '0.5px solid #e2e8f0' }}>

                          {/* Map */}
                          <div style={{ padding: '11px 14px', borderRight: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: '9px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '7px' }}>
                              Location{addrD.ward ? ` · ${addrD.ward}` : ''}
                            </div>
                            <div style={{ borderRadius: '7px', overflow: 'hidden', border: '0.5px solid #e2e8f0', height: '130px' }}>
                              {mapsKey ? (
                                <iframe
                                  title="Terminal map"
                                  width="100%" height="100%"
                                  style={{ border: 0 }}
                                  src={`https://www.google.com/maps/embed/v1/place?key=${mapsKey}&q=${mapQ}&zoom=14`}
                                  allowFullScreen
                                />
                              ) : (
                                <iframe
                                  title="Terminal map"
                                  width="100%" height="100%"
                                  style={{ border: 0 }}
                                  src={`https://www.openstreetmap.org/export/embed.html?bbox=${(addrD.lng||0)-0.01},${(addrD.lat||0)-0.007},${(addrD.lng||0)+0.01},${(addrD.lat||0)+0.007}&layer=mapnik&marker=${addrD.lat||0},${addrD.lng||0}`}
                                />
                              )}
                            </div>
                            {addrD.localAuthority && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addrD.localAuthority}</div>}
                          </div>

                          {/* Sparkline */}
                          <div style={{ padding: '11px 14px', borderRight: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: '9px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{spkLabel || (lrD.salesCount ? `${lrD.salesCount} Land Registry sales` : 'Price trend')}</span>
                              {useHpiFallback && <span style={{ fontSize: '9px', color: '#93c5fd' }}>HPI</span>}
                            </div>
                            {spkPts.length >= 2 ? (
                              <>
                                <svg viewBox="0 0 240 72" width="100%" style={{ display: 'block', marginBottom: '5px' }}>
                                  <line x1="0" y1="64" x2="240" y2="64" stroke="#e2e8f0" strokeWidth="0.5"/>
                                  <line x1="0" y1="33" x2="240" y2="33" stroke="#e2e8f0" strokeWidth="0.5" strokeDasharray="2,2"/>
                                  <line x1="0" y1="4"  x2="240" y2="4"  stroke="#e2e8f0" strokeWidth="0.5"/>
                                  <text x="0" y="8"  fontSize="8" fill="#94a3b8">£{Math.round(spkMax / 1000)}k</text>
                                  <text x="0" y="37" fontSize="8" fill="#94a3b8">£{Math.round((spkMin + spkMax) / 2 / 1000)}k</text>
                                  <polyline points={spkPolyline} fill="none" stroke={useHpiFallback ? '#93c5fd' : '#059669'} strokeWidth="1.5" strokeLinejoin="round"/>
                                  <circle cx={lastX} cy={lastY} r="3" fill={useHpiFallback ? '#93c5fd' : '#059669'}/>
                                  <line x1={lastX} y1={lastY} x2={lastX} y2="64" stroke={useHpiFallback ? '#93c5fd' : '#059669'} strokeWidth="0.5" strokeDasharray="2,2"/>
                                  <text x={Math.max(4, lastX - 18)} y={Math.max(12, lastY - 4)} fontSize="8" fill={useHpiFallback ? '#93c5fd' : '#059669'}>£{Math.round(spkAvg / 1000)}k</text>
                                </svg>
                                <div style={{ fontSize: '10px', color: spkGrowth >= 0 ? '#166534' : '#991b1b', fontWeight: '500', marginBottom: '4px' }}>
                                  {spkGrowth >= 0 ? '+' : ''}{typeof spkGrowth === 'number' ? spkGrowth.toFixed(1) : spkGrowth}% · {useHpiFallback ? 'area trend' : '6-month trend'}
                                </div>
                                {!useHpiFallback && (lrD.items || []).slice(0, 3).map((comp, ci) => (
                                  <div key={ci} style={{ fontSize: '10px', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {comp.address ? `${String(comp.address).substring(0, 26)}… ${comp.price ? `£${Math.round(comp.price / 1000)}k` : ''}` : ''}
                                  </div>
                                ))}
                                {!useHpiFallback && !(lrD.items?.length) && (
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>Avg: £{Math.round(spkAvg / 1000)}k · {lrD.salesCount || 0} sales</div>
                                )}
                                {useHpiFallback && hpiD.area && (
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{hpiD.area} · no postcode sales on record</div>
                                )}
                              </>
                            ) : (
                              <div style={{ fontSize: '11px', color: '#94a3b8', padding: '10px 0' }}>
                                No price data yet — run intelligence to fetch Land Registry comparables{hpiD.avgPrice ? ` (HPI: £${Math.round(hpiD.avgPrice/1000)}k area avg)` : ''}.
                              </div>
                            )}
                          </div>

                          {/* Intel signals */}
                          <div style={{ padding: '11px 14px' }}>
                            <div style={{ fontSize: '9px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '7px', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Signals</span>
                              <span>{connCount}/{totalConn} · {fmtAge(intel.lastRun)}</span>
                            </div>
                            {signals.map((sig, si) => {
                              const col = SC[sig.ok];
                              return (
                                <div key={sig.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: si < signals.length - 1 ? '0.5px solid #f1f5f9' : 'none', fontSize: '11px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '11px' }}>{sig.icon}</span>
                                    <span style={{ color: '#64748b' }}>{sig.l}</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontWeight: '500', color: '#0f172a', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '10px' }}>{sig.v}{sig.d ? ` · ${sig.d}` : ''}</span>
                                    <span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '8px', background: col.bg, color: col.c, flexShrink: 0 }}>
                                      {sig.ok === 'ok' ? 'OK' : sig.ok === 'warn' ? 'Watch' : sig.ok === 'bad' ? '!' : '—'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Row 3 — Notes (compact composer + pinned/recent notes) */}
                        <div style={{ padding: '11px 16px' }}>
                          <div style={{ fontSize: '9px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Notes</span>
                            <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{currentViewProperty.notesList?.length || 0} notes</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                            {/* Composer */}
                            <form onSubmit={handleAddPropertyNote} style={{ border: '0.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: NOTE_TYPE_COLORS[noteType] || '#94a3b8', flexShrink: 0 }} />
                                <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', fontFamily: 'inherit', background: '#fff', color: '#0f172a', outline: 'none' }}>
                                  <option value="Review">Review</option>
                                  <option value="Survey update">Survey update</option>
                                  <option value="Legal">Legal</option>
                                  <option value="Finance">Finance</option>
                                  <option value="Task">Task / action</option>
                                  <option value="Flag">Flag / risk</option>
                                </select>
                                <select value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} style={{ padding: '3px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', fontFamily: 'inherit', background: '#fff', color: '#64748b', outline: 'none' }}>
                                  <option value="Ashley">Ashley</option>
                                  <option value="Femi">Femi</option>
                                </select>
                              </div>
                              <textarea
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder={NOTE_TYPE_PLACEHOLDERS[noteType] || 'Add a note…'}
                                style={{ width: '100%', minHeight: '50px', padding: '7px 10px', border: 'none', fontSize: '11px', fontFamily: 'inherit', resize: 'none', color: '#0f172a', outline: 'none', lineHeight: '1.5', boxSizing: 'border-box' }}
                              />
                              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '5px 10px', borderTop: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
                                <button type="submit" style={{ padding: '4px 12px', background: '#059669', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>Post note</button>
                              </div>
                            </form>
                            {/* Recent notes */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', maxHeight: '130px', overflowY: 'auto' }}>
                              {[...(currentViewProperty.notesList || [])].reverse().slice(0, 4).map(n => {
                                const typeColor = NOTE_TYPE_COLORS[n.type] || '#94a3b8';
                                const typeBg    = NOTE_TYPE_BG[n.type] || '#f8fafc';
                                const typeText  = NOTE_TYPE_TEXT[n.type] || '#64748b';
                                return (
                                  <div key={n.id} style={{ borderRadius: '6px', border: '0.5px solid #e2e8f0', borderLeft: `2px solid ${typeColor}`, background: '#fff', padding: '6px 9px', opacity: n.done ? 0.65 : 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                                      <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: typeBg, color: typeText, fontWeight: '500' }}>{n.type}</span>
                                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{n.author}</span>
                                      {n.bookmarked && <Bookmark size={9} fill="#0284c7" color="#0284c7" />}
                                      <span style={{ fontSize: '9px', color: '#94a3b8', marginLeft: 'auto' }}>{n.date}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '11px', lineHeight: '1.4', color: n.done ? '#94a3b8' : '#1f2937', textDecoration: n.done ? 'line-through' : 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{n.text}</p>
                                  </div>
                                );
                              })}
                              {(!currentViewProperty.notesList || currentViewProperty.notesList.length === 0) && (
                                <div style={{ fontSize: '11px', color: '#94a3b8', padding: '8px 0' }}>No notes yet — use the form to add one.</div>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    );
                  })()}

                  {/* Bid strategy cards */}
                  {(walkBid || targetBid || stretchBid) ? (
                    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Bid strategy</span>
                        {margin != null && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#eaf3de', color: '#27500a' }}>{margin.toFixed(1)}% margin · {an.roi ? `${parseFloat(an.roi).toFixed(1)}% ROI` : ''}</span>}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(3,1fr)', gap: '8px' }}>
                        {[
                          { l: 'Walk away', v: walkBid, sub: 'Minimum threshold', st: {} },
                          { l: 'Target bid', v: targetBid, sub: '20%+ margin', st: { border: '0.5px solid #059669', background: '#f0fdf4' }, vc: '#166534', lc: '#27500a' },
                          { l: 'Stretch bid', v: stretchBid || maxBid, sub: 'Absolute maximum', st: { border: '0.5px solid #d97706', background: '#fffbeb' }, vc: '#92400e' },
                        ].filter(b => b.v > 0).map(b => (
                          <div key={b.l} style={{ border: '0.5px solid #e2e8f0', borderRadius: '8px', padding: '11px 13px', ...b.st }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: b.lc || '#94a3b8', marginBottom: '4px' }}>{b.l}</div>
                            <div style={{ fontSize: '17px', fontWeight: '500', color: b.vc || '#0f172a' }}>{fmtNum(b.v)}</div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{b.sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Deal verdict summary from report */}
                  {an.verdict && (
                    <div style={{ padding: '12px 20px', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', background: /STRONG/i.test(an.verdict) ? '#f0fdf4' : /DO NOT|AVOID/i.test(an.verdict) ? '#fef2f2' : '#fffbeb' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', background: /STRONG/i.test(an.verdict) ? '#dcfce7' : /DO NOT|AVOID/i.test(an.verdict) ? '#fee2e2' : '#fef9c3' }}>
                        {/STRONG/i.test(an.verdict) ? '✅' : /DO NOT|AVOID/i.test(an.verdict) ? '🚫' : '⚠️'}
                      </div>
                      <div>
                        <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '3px' }}>Report verdict</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: /STRONG/i.test(an.verdict) ? '#166534' : /DO NOT|AVOID/i.test(an.verdict) ? '#991b1b' : '#92400e' }}>{an.verdict}</div>
                      </div>
                      {(an.walkAway || an.breakEvenBid) && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', flexShrink: 0 }}>
                          {an.breakEvenBid && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Break-even</div><div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{fmtNum(an.breakEvenBid)}</div></div>}
                          {an.walkAway && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Walk away</div><div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{fmtNum(an.walkAway)}</div></div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Two-col: GDV + Survey */}
                  {(consGDV || baseGDV || maxGDV || surveyJobs.length > 0) && (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ padding: '14px 20px', borderRight: '0.5px solid #e2e8f0' }}>
                        {(consGDV || baseGDV || maxGDV) ? (() => {
                          const ALL_GDV = [
                            { l: 'Conservative', v: consGDV, mx: an.matrixConservative, bg: '#f8fafc', bc: '#e2e8f0', vc: '#0f172a', hc: '#64748b', selfBg: '#f1f5f9', selfBc: '#94a3b8' },
                            { l: 'Base',         v: baseGDV, mx: an.matrixBase,         bg: '#eff6ff', bc: '#bfdbfe', vc: '#1e40af', hc: '#1e40af', selfBg: '#eff6ff', selfBc: '#3b82f6' },
                            { l: 'Optimistic',   v: maxGDV,  mx: an.matrixOptimistic,   bg: '#eaf3de', bc: '#c0dd97', vc: '#27500a', hc: '#166534', selfBg: '#f0fdf4', selfBc: '#059669' },
                          ].filter(g => g.v);
                          const activeSel = ALL_GDV.find(g => g.l === selectedGDVScenario) || ALL_GDV[0];
                          const hasMatrix = ALL_GDV.some(g => g.mx?.length);
                          const colHeaders = an.matrixHeaders?.length ? an.matrixHeaders : (activeSel?.mx?.[0]?.cells || []).map((_, i) => ['Light refurb', 'Medium refurb', 'Heavy refurb'][i] || `Scenario ${i + 1}`);
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Section header + GDV selector pills */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8' }}>GDV scenarios</div>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  {ALL_GDV.map(g => {
                                    const active = g.l === (activeSel?.l);
                                    return (
                                      <button key={g.l} onClick={() => setSelectedGDVScenario(g.l)} style={{ padding: '3px 9px', borderRadius: '12px', border: `1px solid ${active ? g.selfBc : '#e2e8f0'}`, background: active ? g.selfBg : '#fff', color: active ? g.hc : '#94a3b8', fontSize: '10px', fontWeight: active ? '600' : '400', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {g.l}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                              {/* Active GDV value + implied profit */}
                              {activeSel && (
                                <div style={{ borderRadius: '8px', padding: '11px 14px', border: `1px solid ${activeSel.bc}`, background: activeSel.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: '2px' }}>{activeSel.l} GDV</div>
                                    <div style={{ fontSize: '20px', fontWeight: '600', color: activeSel.vc }}>{fmtNum(activeSel.v)}</div>
                                  </div>
                                  {an.totalInvestment > 0 && (
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: '2px' }}>Implied profit</div>
                                      <div style={{ fontSize: '16px', fontWeight: '600', color: (activeSel.v - an.totalInvestment) >= 0 ? '#166534' : '#991b1b' }}>
                                        {(activeSel.v - an.totalInvestment) >= 0 ? '+' : ''}{fmtNum(Math.abs(activeSel.v - an.totalInvestment))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {/* Single bid-outcome matrix for selected GDV */}
                              {hasMatrix && (
                                <div style={{ overflowX: 'auto' }}>
                                  {activeSel?.mx?.length ? (
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                      <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                          <th style={{ padding: '5px 8px', textAlign: 'left', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>Hammer price</th>
                                          {colHeaders.map(h => (
                                            <React.Fragment key={h}>
                                              <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600', color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                                              <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '500', color: '#94a3b8', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>Margin</th>
                                            </React.Fragment>
                                          ))}
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {activeSel.mx.map((row, ri) => (
                                          <tr key={row.hammer} style={{ background: ri % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '0.5px solid #f1f5f9' }}>
                                            <td style={{ padding: '5px 8px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap' }}>{row.label}</td>
                                            {(row.cells || []).map((cell, ci) => (
                                              <React.Fragment key={ci}>
                                                <td style={{ padding: '5px 6px', textAlign: 'right', color: (cell.profit ?? 0) >= 0 ? '#166534' : '#991b1b', fontWeight: '500' }}>
                                                  {cell.profit != null ? `£${Math.abs(cell.profit).toLocaleString()}` : '—'}
                                                </td>
                                                <td style={{ padding: '5px 6px', textAlign: 'right', color: (cell.margin ?? 0) >= 20 ? '#166534' : (cell.margin ?? 0) >= 10 ? '#92400e' : '#991b1b' }}>
                                                  {cell.margin != null ? `${cell.margin.toFixed(1)}%` : '—'}
                                                </td>
                                              </React.Fragment>
                                            ))}
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <div style={{ fontSize: '11px', color: '#94a3b8', padding: '4px 0' }}>No matrix data for {activeSel?.l} GDV in this report.</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })() : <div style={{ fontSize: '12px', color: '#94a3b8' }}>Upload an assessment report to see GDV scenarios.</div>}
                      </div>
                      <div style={{ padding: '14px 20px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>Survey</span>
                          <button onClick={() => setShowSurveyJobModal(true)} style={{ padding: '2px 8px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer', fontFamily: 'inherit' }}>+ Log</button>
                        </div>
                        {latestJob ? (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a', marginBottom: '2px' }}>{latestJob.surveyorName}</div>
                            {latestJob.companyName && <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '5px' }}>{latestJob.companyName}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '11px', color: '#64748b' }}>
                              {latestJob.dateBooked && <span>Booked: {latestJob.dateBooked}</span>}
                              {latestJob.surveyDate && <span>Appointment: {latestJob.surveyDate}</span>}
                              {latestJob.dateReceived
                                ? <span style={{ color: '#059669', fontWeight: '500' }}>Report received: {latestJob.dateReceived}</span>
                                : latestJob.turnaroundRange && <span>Turnaround: {latestJob.turnaroundRange}</span>}
                              {latestJob.cost > 0 && <span>Fee: £{latestJob.cost.toLocaleString()}</span>}
                              {latestJob.rating > 0 && <span>Rating: {'★'.repeat(latestJob.rating)}{'☆'.repeat(5 - latestJob.rating)}</span>}
                            </div>
                            {surveyJobs.length > 1 && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>{surveyJobs.length} surveys logged total</div>}
                          </div>
                        ) : <div style={{ fontSize: '12px', color: '#94a3b8' }}>No survey logged yet. Click + Log to record one.</div>}
                      </div>
                    </div>
                  )}

                  {/* Two-col: Cost stack + Notes */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', borderBottom: '0.5px solid #e2e8f0' }}>
                    {/* Cost stack */}
                    <div style={{ padding: '14px 20px', borderRight: '0.5px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px' }}>Cost stack</div>
                      {pp2 > 0 || refurbCost > 0 ? (
                        <div style={{ border: '0.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                          {[
                            { l: 'Purchase price', v: pp2 },
                            { l: 'Acquisition fees', v: acqFees },
                            { l: 'Refurb', v: refurbCost },
                            { l: 'Holding costs', v: holdingCost },
                            { l: 'Contingency', v: contingency },
                          ].filter(r => r.v > 0).map(r => (
                            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', fontSize: '12px', borderBottom: '0.5px solid #f1f5f9', color: '#64748b' }}>
                              <span>{r.l}</span><span>£{Math.round(r.v).toLocaleString()}</span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px', fontSize: '12px', fontWeight: '500', background: '#f8fafc' }}>
                            <span>Total</span><span>£{Math.round(costTotal).toLocaleString()}</span>
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>Use the Deal Calculator in <button onClick={() => setIsPropNotesExpanded(!isPropNotesExpanded)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0284c7', fontSize: '12px', fontFamily: 'inherit', padding: 0, textDecoration: 'underline' }}>Details & Analysis</button> below to build a cost stack.</div>
                      )}
                    </div>

                    {/* Notes */}
                    <div style={{ padding: '14px 20px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Notes</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{currentViewProperty.notesList?.length || 0} notes</span>
                      </div>
                      {/* Composer */}
                      <form onSubmit={handleAddPropertyNote} style={{ border: '0.5px solid #e2e8f0', borderRadius: '9px', overflow: 'hidden', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: NOTE_TYPE_COLORS[noteType] || '#94a3b8', flexShrink: 0 }} />
                            <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '11px', fontFamily: 'inherit', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: '500', outline: 'none' }}>
                              <option value="Review">Review</option>
                              <option value="Survey update">Survey update</option>
                              <option value="Legal">Legal</option>
                              <option value="Finance">Finance</option>
                              <option value="Task">Task / action</option>
                              <option value="Flag">Flag / risk</option>
                            </select>
                          </div>
                          <select value={noteAuthor} onChange={e => setNoteAuthor(e.target.value)} style={{ padding: '4px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '11px', fontFamily: 'inherit', background: '#fff', color: '#64748b', outline: 'none' }}>
                            <option value="Ashley">Ashley</option>
                            <option value="Femi">Femi</option>
                          </select>
                          <div onClick={() => setNoteBookmark(!noteBookmark)} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '11px', color: noteBookmark ? '#0284c7' : '#94a3b8', marginLeft: 'auto', userSelect: 'none' }}>
                            <Bookmark size={12} fill={noteBookmark ? '#0284c7' : 'none'} /> Pin
                          </div>
                        </div>
                        <textarea
                          value={noteText}
                          onChange={e => setNoteText(e.target.value)}
                          placeholder={NOTE_TYPE_PLACEHOLDERS[noteType] || 'Add a note…'}
                          style={{ width: '100%', minHeight: '58px', padding: '9px 12px', border: 'none', fontSize: '12px', fontFamily: 'inherit', resize: 'none', color: '#0f172a', outline: 'none', lineHeight: '1.6', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px', borderTop: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
                          <button type="submit" style={{ padding: '5px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>Post note</button>
                        </div>
                      </form>
                      {/* Notes list */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '340px', overflowY: 'auto' }}>
                        {[...(currentViewProperty.notesList || [])].reverse().map(n => {
                          const typeColor = NOTE_TYPE_COLORS[n.type] || '#94a3b8';
                          const typeBg = NOTE_TYPE_BG[n.type] || '#f8fafc';
                          const typeText = NOTE_TYPE_TEXT[n.type] || '#64748b';
                          const isEditing = editingNoteId === n.id;
                          return (
                            <div key={n.id} style={{ borderRadius: '8px', border: '1px solid #e2e8f0', borderLeft: `3px solid ${typeColor}`, opacity: n.done ? 0.65 : 1 }}>
                              <div style={{ padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '6px', borderBottom: '1px solid #f8fafc' }}>
                                <input type="checkbox" checked={!!n.done} onChange={() => toggleNoteTaskState(currentViewProperty.id, n.id)} style={{ cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', padding: '1px 6px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: typeBg, color: typeText }}>{n.type}</span>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>{n.author}</span>
                                {n.bookmarked && <Bookmark size={10} fill="#0284c7" color="#0284c7" />}
                                <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{n.date}</span>
                              </div>
                              {isEditing ? (
                                <div style={{ padding: '7px 10px' }}>
                                  <textarea value={editingNoteText} onChange={e => setEditingNoteText(e.target.value)} autoFocus style={{ width: '100%', minHeight: '52px', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '12px', fontFamily: 'inherit', resize: 'none', outline: 'none', lineHeight: '1.5', boxSizing: 'border-box' }} />
                                  <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                                    <button onClick={() => handleSaveEditPropertyNote(n.id)} style={{ padding: '3px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                    <button onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }} style={{ padding: '3px 8px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <p style={{ margin: 0, padding: '7px 10px', fontSize: '12px', lineHeight: '1.55', color: n.done ? '#94a3b8' : '#1f2937', textDecoration: n.done ? 'line-through' : 'none' }}>{n.text}</p>
                              )}
                              {!isEditing && (
                                <div style={{ display: 'flex', gap: '2px', padding: '0 8px 6px' }}>
                                  <button onClick={() => { setEditingNoteId(n.id); setEditingNoteText(n.text); }} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#94a3b8', fontFamily: 'inherit', padding: '2px 5px', borderRadius: '3px' }}><Pencil size={10} /> Edit</button>
                                  <button onClick={() => { const u = { ...currentViewProperty, notesList: currentViewProperty.notesList.filter(x => x.id !== n.id) }; setCurrentViewProperty(u); setProperties(prev => prev.map(p => p.id === u.id ? u : p)); if (editingNoteId === n.id) { setEditingNoteId(null); setEditingNoteText(''); } }} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#e24b4a', fontFamily: 'inherit', padding: '2px 5px', borderRadius: '3px' }}><Trash2 size={10} /> Delete</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {(!currentViewProperty.notesList || currentViewProperty.notesList.length === 0) && (
                          <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, textAlign: 'center', padding: '12px 0' }}>No notes yet — use the form above.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Activity log */}
                  <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px' }}>Activity</div>
                    {actLog.length === 0 ? (
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>No activity recorded yet.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {actLog.slice(0, 8).map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderBottom: '0.5px solid #f1f5f9' }}>
                            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '13px' }}>{AICONS[a.type] || '•'}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '12px', fontWeight: '500', marginBottom: '1px' }}>{a.detail}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{a.user}</div>
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', paddingTop: '2px' }}>{fmtAt(a.at)}</div>
                          </div>
                        ))}
                        {actLog.length > 8 && <div style={{ fontSize: '11px', color: '#94a3b8', paddingTop: '8px' }}>{actLog.length - 8} more events…</div>}
                      </div>
                    )}
                  </div>

                  {/* Map */}
                  <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                    <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Location</span>
                      <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{currentViewProperty.address}</span>
                    </div>
                    <div style={{ borderRadius: '8px', overflow: 'hidden', border: '0.5px solid #e2e8f0', height: '180px' }}>
                      <iframe title="Property Radar Map" width="100%" height="100%" style={{ border: 0 }} src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(currentViewProperty.address)}&zoom=14`} allowFullScreen />
                    </div>
                  </div>

                  {/* ── Property Intelligence Panel ── */}
                  <div style={{ padding: '14px 20px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8' }}>Property Intelligence</div>
                        {intel.lastRun && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Last run: {fmtAt(intel.lastRun)}</div>}
                      </div>
                      <button
                        onClick={() => runPropertyIntelligence(currentViewProperty)}
                        disabled={intelligenceRunning || !propPostcode}
                        style={{ padding: '5px 12px', fontSize: '11px', borderRadius: '6px', border: '1px solid #e2e8f0', background: intelligenceRunning ? '#f1f5f9' : '#059669', color: intelligenceRunning ? '#64748b' : '#fff', cursor: intelligenceRunning || !propPostcode ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: !propPostcode ? 0.4 : 1 }}
                      >
                        {intelligenceRunning ? '⏳ Running…' : intel.lastRun ? 'Refresh' : 'Run Intelligence'}
                      </button>
                    </div>

                    {!intel.lastRun && !intelligenceRunning && (
                      <div style={{ border: '1px dashed #e2e8f0', borderRadius: '8px', padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                        <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔍</div>
                        <div style={{ fontSize: '12px', fontWeight: '500', color: '#64748b', marginBottom: '4px' }}>No intelligence data yet</div>
                        <div style={{ fontSize: '11px' }}>
                          {propPostcode
                            ? `Click "Run Intelligence" to fetch EPC, Land Registry, crime, flood risk, planning constraints, and local amenities for ${propPostcode}`
                            : 'Add a postcode to the property address to enable intelligence enrichment'}
                        </div>
                      </div>
                    )}

                    {intelligenceRunning && (
                      <div style={{ border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', background: '#eff6ff', textAlign: 'center', color: '#1d4ed8', fontSize: '12px' }}>
                        ⏳ Querying public APIs — Land Registry, EPC, Police.uk, Flood, Planning, OSM, IMD, UK HPI, Schools (Ofsted), TfL, ONS Census…
                      </div>
                    )}

                    {intel.lastRun && !intelligenceRunning && (() => {
                      const c = intel.connectors || {};
                      const addr  = c.address?.data;
                      const lr    = c.landRegistry?.data;
                      const epc   = c.epc?.data;
                      const police= c.police?.data;
                      const flood = c.flood?.data;
                      const plan  = c.planning?.data;
                      const osm   = c.osm?.data;
                      const imd   = c.imd?.data;
                      const hpi   = c.hpi?.data;
                      const tfl   = c.tfl?.data;
                      const schl  = c.schools?.data;
                      const cens  = c.census?.data;

                      const Card = ({ title, icon, children, status }) => (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                          <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '14px' }}>{icon}</span>
                              <span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>{title}</span>
                            </div>
                            {status && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: status==='error'?'#fee2e2':'#dcfce7', color: status==='error'?'#991b1b':'#166534' }}>{status==='error'?'Failed':'OK'}</span>}
                          </div>
                          <div style={{ padding: '10px 12px', fontSize: '11px', color: '#334155', lineHeight: '1.7' }}>{children}</div>
                        </div>
                      );
                      const Row = ({ l, v }) => v ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><span style={{ color: '#64748b' }}>{l}</span><span style={{ fontWeight: '500', textAlign: 'right' }}>{v}</span></div> : null;

                      return (
                        <div>
                          {/* Conflicts banner */}
                          {intelConflicts.filter(x=>!x.resolved).length > 0 && (
                            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '10px 14px', marginBottom: '10px', fontSize: '11px', color: '#92400e' }}>
                              <strong>⚠️ {intelConflicts.filter(x=>!x.resolved).length} conflict{intelConflicts.filter(x=>!x.resolved).length!==1?'s':''} between report and API data:</strong>
                              {intelConflicts.filter(x=>!x.resolved).map((conf,i) => <div key={i} style={{ marginTop: '3px' }}>· {conf.text}</div>)}
                              <div style={{ marginTop: '6px', color: '#78350f', fontSize: '10px' }}>Assessment report data takes priority. Review and resolve if needed.</div>
                            </div>
                          )}

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                            {/* Location */}
                            {addr && (
                              <Card title="Location" icon="📍" status={c.address?.status}>
                                <Row l="Local authority" v={addr.localAuthority} />
                                <Row l="Ward" v={addr.ward} />
                                <Row l="Region" v={addr.region} />
                                <Row l="Constituency" v={addr.constituency} />
                                {addr.lat && <Row l="Coordinates" v={`${addr.lat.toFixed(4)}, ${addr.lng.toFixed(4)}`} />}
                              </Card>
                            )}

                            {/* Market Data */}
                            {lr && (
                              <Card title="Market Data" icon="📊" status={c.landRegistry?.status}>
                                <Row l="Avg sold price" v={lr.avgPrice ? `£${lr.avgPrice.toLocaleString()}` : null} />
                                <Row l="Recent sales" v={lr.salesCount ? `${lr.salesCount} transactions` : null} />
                                {lr.priceGrowth != null && (
                                  <Row l="Price trend" v={<span style={{ color: lr.priceGrowth>=0?'#166534':'#991b1b' }}>{lr.priceGrowth>=0?'+':''}{lr.priceGrowth}%</span>} />
                                )}
                                <div style={{ marginTop: '6px', fontSize: '10px', color: '#94a3b8' }}>Based on {lr.salesCount} Land Registry transactions</div>
                              </Card>
                            )}

                            {/* EPC */}
                            {epc && (
                              <Card title="EPC" icon="⚡" status={c.epc?.status}>
                                {epc.epcRating && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                    <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: {'A':'#00a550','B':'#50b848','C':'#b3ce3e','D':'#fff200','E':'#f8b832','F':'#f07f30','G':'#ed1c24'}[epc.epcRating]||'#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: ['A','B','C'].includes(epc.epcRating)?'#fff':'#000' }}>{epc.epcRating}</div>
                                    <span>Current rating{epc.potentialRating ? ` · Potential: ${epc.potentialRating}` : ''}</span>
                                  </div>
                                )}
                                <Row l="Floor area" v={epc.floorArea ? `${epc.floorArea} m²` : null} />
                                <Row l="Heating" v={epc.heatingType} />
                                {epc.energyFlags?.length > 0 && (
                                  <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                    {epc.energyFlags.map(f => <span key={f} style={{ padding: '1px 6px', borderRadius: '10px', background: '#fef3c7', color: '#92400e', fontSize: '10px' }}>{f}</span>)}
                                  </div>
                                )}
                              </Card>
                            )}

                            {/* Crime */}
                            {police && (
                              <Card title="Crime Risk" icon="🚔" status={c.police?.status}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                  <div style={{ padding: '2px 8px', borderRadius: '4px', fontWeight: '600', fontSize: '12px', background: {'Low':'#dcfce7','Medium':'#fef9c3','High':'#fee2e2','Very High':'#fee2e2'}[police.riskLabel]||'#f1f5f9', color: {'Low':'#166534','Medium':'#92400e','High':'#991b1b','Very High':'#7f1d1d'}[police.riskLabel]||'#475569' }}>{police.riskLabel}</div>
                                  <span style={{ color: '#94a3b8' }}>risk area</span>
                                </div>
                                <Row l="Avg crimes/month" v={police.monthlyAverage} />
                                <Row l="Anti-social behaviour" v={police.antisocialBehaviour > 0 ? police.antisocialBehaviour : null} />
                                <Row l="Burglary" v={police.burglary > 0 ? police.burglary : null} />
                                <Row l="Violent crime" v={police.violentCrime > 0 ? police.violentCrime : null} />
                                <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}>Data from {police.monthsAnalysed} months · Police.uk</div>
                              </Card>
                            )}

                            {/* Flood */}
                            {flood && (
                              <Card title="Flood Risk" icon="🌊" status={c.flood?.status}>
                                <div style={{ marginBottom: '4px', fontWeight: '500', color: flood.floodAreasNearby > 0 ? '#92400e' : '#166534', fontSize: '12px' }}>
                                  {flood.floodAreasNearby > 0 ? `⚠️ ${flood.floodAreasNearby} EA area(s) nearby` : '✅ No flood areas within 0.5km'}
                                </div>
                                {flood.hasCurrentWarning && <div style={{ color: '#991b1b', fontSize: '11px' }}>Active flood warning in this area</div>}
                                {flood.areas.map(a => <div key={a.name} style={{ color: '#64748b', fontSize: '10px' }}>· {a.name}{a.severity ? ` (${a.severity})` : ''}</div>)}
                                <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}>Environment Agency data · Due diligence only</div>
                              </Card>
                            )}

                            {/* Planning */}
                            {plan && (
                              <Card title="Planning Constraints" icon="🏛️" status={c.planning?.status}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                  {[
                                    { l: `Listed Building${plan.listedBuildingGrade ? ` (Grade ${plan.listedBuildingGrade})` : ''}`, v: plan.listedBuilding, warn: true },
                                    { l: 'Conservation Area', v: plan.conservationArea, warn: true },
                                    { l: 'Article 4 Direction', v: plan.article4Direction, warn: true },
                                    { l: 'Tree Pres. Order', v: plan.treePO, warn: true },
                                    { l: 'SSSI', v: plan.sssi, warn: true },
                                    { l: 'AONB', v: plan.aonb, warn: true },
                                    { l: 'National Park', v: plan.nationalPark, warn: true },
                                  ].map(item => item.v ? (
                                    <span key={item.l} style={{ padding: '1px 6px', borderRadius: '10px', background: '#fef3c7', color: '#92400e', fontSize: '10px' }}>⚠️ {item.l}</span>
                                  ) : null)}
                                  {plan.constraintCount === 0 && (
                                    <span style={{ fontSize: '11px', color: '#166534' }}>✅ No planning constraints identified</span>
                                  )}
                                </div>
                                {(plan.brownfield || plan.enterpriseZone || plan.opportunityArea) && (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                                    {plan.brownfield && <span style={{ padding: '1px 6px', borderRadius: '10px', background: '#dcfce7', color: '#166534', fontSize: '10px' }}>✅ Brownfield land</span>}
                                    {plan.enterpriseZone && <span style={{ padding: '1px 6px', borderRadius: '10px', background: '#dbeafe', color: '#1e40af', fontSize: '10px' }}>⭐ Enterprise Zone</span>}
                                    {plan.opportunityArea && <span style={{ padding: '1px 6px', borderRadius: '10px', background: '#dbeafe', color: '#1e40af', fontSize: '10px' }}>⭐ Opportunity Area</span>}
                                  </div>
                                )}
                                <div style={{ fontSize: '10px', color: '#94a3b8' }}>DLUHC Planning Data · Not legal advice</div>
                              </Card>
                            )}
                            {/* UK HPI */}
                            {hpi && (
                              <Card title="UK House Price Index" icon="📈" status={c.hpi?.status}>
                                <Row l="Avg price (LA)" v={hpi.avgPrice ? `£${hpi.avgPrice.toLocaleString()}` : null} />
                                {hpi.growth1yr != null && <Row l="1yr growth" v={<span style={{ color: hpi.growth1yr >= 0 ? '#166534' : '#991b1b', fontWeight: '600' }}>{hpi.growth1yr >= 0 ? '+' : ''}{hpi.growth1yr}%</span>} />}
                                {hpi.growth3yr != null && <Row l="3yr growth" v={<span style={{ color: hpi.growth3yr >= 0 ? '#166534' : '#991b1b' }}>{hpi.growth3yr >= 0 ? '+' : ''}{hpi.growth3yr}%</span>} />}
                                {hpi.growth5yr != null && <Row l="5yr growth" v={<span style={{ color: hpi.growth5yr >= 0 ? '#166534' : '#991b1b' }}>{hpi.growth5yr >= 0 ? '+' : ''}{hpi.growth5yr}%</span>} />}
                                <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}>Land Registry HPI · {hpi.area} · {hpi.lastUpdated?.slice(0, 7)}</div>
                              </Card>
                            )}

                            {/* IMD Deprivation */}
                            {imd && (
                              <Card title="Deprivation Index (IMD 2019)" icon="📊" status={c.imd?.status}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                  <div style={{ width: '32px', height: '32px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '14px', background: imd.decile >= 8 ? '#dcfce7' : imd.decile >= 5 ? '#fef9c3' : imd.decile >= 3 ? '#fed7aa' : '#fee2e2', color: imd.decile >= 8 ? '#166534' : imd.decile >= 5 ? '#92400e' : imd.decile >= 3 ? '#9a3412' : '#991b1b' }}>D{imd.decile}</div>
                                  <div><div style={{ fontWeight: '600', fontSize: '11px' }}>{imd.label}</div><div style={{ fontSize: '10px', color: '#94a3b8' }}>Decile 1 = most deprived</div></div>
                                </div>
                                <Row l="Income" v={imd.incomeDecile ? `Decile ${imd.incomeDecile}` : null} />
                                <Row l="Employment" v={imd.employmentDecile ? `Decile ${imd.employmentDecile}` : null} />
                                <Row l="Education" v={imd.educationDecile ? `Decile ${imd.educationDecile}` : null} />
                                <Row l="Health" v={imd.healthDecile ? `Decile ${imd.healthDecile}` : null} />
                                <Row l="Crime" v={imd.crimeDecile ? `Decile ${imd.crimeDecile}` : null} />
                                <div style={{ marginTop: '4px', fontSize: '10px', color: '#94a3b8' }}>MHCLG IMD 2019 · LSOA level</div>
                              </Card>
                            )}
                          </div>

                          {/* Schools */}
                          {schl && schl.schools?.length > 0 && (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '14px' }}>🏫</span><span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>Nearby Schools (Ofsted)</span></div>
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{schl.schoolCount} within 1 mile · {schl.outstandingCount} Outstanding</span>
                              </div>
                              <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '4px' }}>
                                {schl.schools.slice(0, 8).map((s, i) => {
                                  const ratingCol = s.ofstedRating === 'Outstanding' ? { bg: '#dcfce7', c: '#166534' } : s.ofstedRating === 'Good' ? { bg: '#dbeafe', c: '#1e40af' } : s.ofstedRating === 'Requires Improvement' ? { bg: '#fef9c3', c: '#92400e' } : s.ofstedRating === 'Inadequate' ? { bg: '#fee2e2', c: '#991b1b' } : { bg: '#f1f5f9', c: '#64748b' };
                                  return (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #f1f5f9', fontSize: '11px' }}>
                                      <div style={{ minWidth: 0, paddingRight: '6px' }}>
                                        <div style={{ fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8' }}>{s.phase}</div>
                                      </div>
                                      {s.ofstedRating && <span style={{ flexShrink: 0, fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: ratingCol.bg, color: ratingCol.c, fontWeight: '600' }}>{s.ofstedRating}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              <div style={{ padding: '4px 12px 8px', fontSize: '10px', color: '#94a3b8' }}>DfE Get Information About Schools · Ofsted ratings</div>
                            </div>
                          )}

                          {/* TfL Transport (London only) */}
                          {tfl?.inLondon && (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '14px' }}>🚇</span><span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>TfL Transport</span></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: tfl.transportScore >= 7 ? '#166534' : tfl.transportScore >= 4 ? '#92400e' : '#991b1b' }}>Score {tfl.transportScore}/10</span>
                                  {tfl.tflZone && <span style={{ fontSize: '10px', color: '#94a3b8' }}>Zone {tfl.tflZone}</span>}
                                </div>
                              </div>
                              <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', fontSize: '11px', color: '#334155' }}>
                                {tfl.tubeStops?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🚇 Tube within 800m</div>
                                    {tfl.tubeStops.map(s => <div key={s.name} style={{ fontWeight: '500' }}>{s.name} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({s.distanceM}m)</span></div>)}
                                  </div>
                                )}
                                {tfl.elizabethLineStops?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🟣 Elizabeth line</div>
                                    {tfl.elizabethLineStops.map(s => <div key={s.name} style={{ fontWeight: '500' }}>{s.name} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({s.distanceM}m)</span></div>)}
                                  </div>
                                )}
                                {tfl.dlrStops?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🔵 DLR</div>
                                    {tfl.dlrStops.map(s => <div key={s.name} style={{ fontWeight: '500' }}>{s.name} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({s.distanceM}m)</span></div>)}
                                  </div>
                                )}
                                {tfl.overgroundStops?.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🟠 Overground</div>
                                    {tfl.overgroundStops.map(s => <div key={s.name} style={{ fontWeight: '500' }}>{s.name} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({s.distanceM}m)</span></div>)}
                                  </div>
                                )}
                                {tfl.busStopsCount > 0 && <div><div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🚌 Bus stops nearby</div><div style={{ fontWeight: '500' }}>{tfl.busStopsCount} stop{tfl.busStopsCount !== 1 ? 's' : ''}</div></div>}
                                {tfl.bikePointsCount > 0 && <div><div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '3px' }}>🚲 Santander Cycles</div><div style={{ fontWeight: '500' }}>{tfl.bikePointsCount} docking point{tfl.bikePointsCount !== 1 ? 's' : ''}</div></div>}
                              </div>
                              {tfl.lines?.length > 0 && (
                                <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                                  {tfl.lines.map(l => <span key={l} style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '8px', background: '#f1f5f9', color: '#475569' }}>{l}</span>)}
                                </div>
                              )}
                            </div>
                          )}

                          {/* ONS Census demographics */}
                          {cens?.tenure && (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ fontSize: '14px' }}>👥</span><span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>Area Demographics (ONS Census 2021)</span></div>
                              <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '12px', fontSize: '11px' }}>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>Tenure</div>
                                  {cens.tenure.ownedOutrightPct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Owned outright</span><span style={{ fontWeight: '500' }}>{cens.tenure.ownedOutrightPct}%</span></div>}
                                  {cens.tenure.ownedMortgagePct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Owned w/ mortgage</span><span style={{ fontWeight: '500' }}>{cens.tenure.ownedMortgagePct}%</span></div>}
                                  {cens.tenure.privateRentPct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Private rented</span><span style={{ fontWeight: '500' }}>{cens.tenure.privateRentPct}%</span></div>}
                                  {cens.tenure.socialRentPct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Social rented</span><span style={{ fontWeight: '500' }}>{cens.tenure.socialRentPct}%</span></div>}
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>Population</div>
                                  {cens.population?.total != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Total pop.</span><span style={{ fontWeight: '500' }}>{cens.population.total.toLocaleString()}</span></div>}
                                  {cens.population?.under35Pct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Under 35</span><span style={{ fontWeight: '500' }}>{cens.population.under35Pct}%</span></div>}
                                  {cens.population?.over65Pct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Over 65</span><span style={{ fontWeight: '500' }}>{cens.population.over65Pct}%</span></div>}
                                </div>
                                <div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px', fontWeight: '500' }}>Employment</div>
                                  {cens.employment?.employedPct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Employed</span><span style={{ fontWeight: '500' }}>{cens.employment.employedPct}%</span></div>}
                                  {cens.employment?.unemployedPct != null && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748b' }}>Unemployed</span><span style={{ fontWeight: '500' }}>{cens.employment.unemployedPct}%</span></div>}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Amenities & Transport full-width */}
                          {osm && (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginTop: '0' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '14px' }}>🏘️</span>
                                  <span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>Amenities & Transport</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '11px', fontWeight: '700', color: osm.amenityScore>=6?'#166534':osm.amenityScore>=4?'#92400e':'#991b1b' }}>{osm.amenityLabel}</span>
                                  <span style={{ fontSize: '10px', color: '#94a3b8' }}>({osm.amenityScore}/10)</span>
                                </div>
                              </div>
                              <div style={{ padding: '10px 12px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', fontSize: '11px', color: '#334155' }}>
                                {[
                                  { icon: '🏫', label: 'Nearest school', dist: osm.nearestSchoolM, items: osm.schools },
                                  { icon: '🛒', label: 'Nearest supermarket', dist: osm.nearestSupermarketM },
                                  { icon: '🚉', label: 'Nearest station', dist: osm.nearestStationM, items: osm.stations },
                                  { icon: '🏥', label: 'Hospitals nearby', count: osm.hospitals?.length },
                                  { icon: '👨‍⚕️', label: 'GP surgeries', count: osm.gp?.length },
                                  { icon: '🌳', label: 'Parks nearby', count: osm.parks?.length },
                                ].map(item => (
                                  <div key={item.label}>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '2px' }}>{item.icon} {item.label}</div>
                                    <div style={{ fontWeight: '500' }}>
                                      {item.dist != null ? (item.dist < 1000 ? `${item.dist}m` : `${(item.dist/1000).toFixed(1)}km`) : item.count != null ? `${item.count}` : '—'}
                                    </div>
                                    {item.items?.[0]?.name && <div style={{ fontSize: '10px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.items[0].name}</div>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Land Registry comparables */}
                          {lr?.items?.length > 0 && (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginTop: '8px' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '600', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📋 Land Registry Comparables</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {lr.compsEnriched && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af' }}>+ EPC enriched</span>}
                                  <span style={{ fontWeight: '400', color: '#94a3b8' }}>{lr.items.length} sales · {currentViewProperty.postcode || extractPostcode(currentViewProperty.address || '')}</span>
                                </div>
                              </div>
                              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                {lr.items.slice(0, 12).map((item, i) => {
                                  const EPC_COL = { A:'#00a550',B:'#50b848',C:'#b3ce3e',D:'#fff200',E:'#f8b832',F:'#f07f30',G:'#ed1c24' };
                                  const epcBg = EPC_COL[item.epcRating] || null;
                                  const epcTxt = item.epcRating ? (['A','B','C'].includes(item.epcRating) ? '#fff' : '#000') : '#000';
                                  return (
                                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '6px 12px', borderBottom: '0.5px solid #f8fafc', fontSize: '11px', gap: '8px' }}>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[item.address, item.town].filter(Boolean).join(', ')}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                                          {item.propertyType && <span style={{ color: '#64748b', fontSize: '10px' }}>{item.propertyType}{item.newBuild ? ' · New build' : ''}</span>}
                                          {item.epcRating && (
                                            <span style={{ fontSize: '9px', padding: '0 4px', borderRadius: '3px', background: epcBg, color: epcTxt, fontWeight: '700', lineHeight: '14px' }}>EPC {item.epcRating}</span>
                                          )}
                                          {item.floorArea && <span style={{ fontSize: '10px', color: '#475569' }}>{item.floorArea}m²</span>}
                                          {item.habitableRooms && <span style={{ fontSize: '10px', color: '#475569' }}>{item.habitableRooms} rooms</span>}
                                          {item.floorArea && item.price && <span style={{ fontSize: '10px', color: '#94a3b8' }}>£{Math.round(item.price / Number(item.floorArea)).toLocaleString()}/m²</span>}
                                        </div>
                                      </div>
                                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontWeight: '600', color: '#0f172a' }}>£{item.price.toLocaleString()}</div>
                                        <div style={{ color: '#94a3b8', fontSize: '10px' }}>{item.date?.slice(0, 7)}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              {lr.compsEnriched && (
                                <div style={{ padding: '5px 12px', fontSize: '10px', color: '#94a3b8', borderTop: '0.5px solid #f1f5f9', background: '#fafafa' }}>
                                  EPC data matched by address · floor area enables £/m² comparison · habitable rooms (bed + reception)
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                </div>

              </div>
            );
          } catch (err) {
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: '#64748b' }}>
                <div style={{ fontSize: '32px' }}>⚠️</div>
                <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a' }}>Could not render this property</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '320px', textAlign: 'center' }}>{String(err?.message || err)}</div>
                <button onClick={() => setCurrentViewProperty(null)} style={{ marginTop: '8px', padding: '8px 18px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}>← Back to pipeline</button>
              </div>
            );
          } })()

        ) : currentViewCompany && !currentViewProperty && !currentViewContact && activeTab !== 'companies' ? (
          // ==================== COMPANY FULL DISCOVERY WORKSPACE ====================
          <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#ffffff' }}>
            <div style={{ width: '300px', borderRight: '1px solid #e2e8f0', padding: '32px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <button onClick={() => setCurrentViewCompany(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}><ArrowLeft size={14} /> Back to Directory</button>
              <div>
                <h2 style={{ margin: '12px 0 4px 0', fontSize: '22px', color: '#0f172a' }}>{currentViewCompany.name}</h2>
                <a href={`https://${currentViewCompany.website}`} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#0284c7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}><Globe size={14} /> {currentViewCompany.website}</a>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px' }}>
                <div><span style={{ color: '#64748b' }}>Account Entity Type:</span> <strong style={{ color: '#0f172a' }}>{currentViewCompany.type}</strong></div>
                <div><span style={{ color: '#64748b' }}>Account Owner:</span> <strong>{currentViewCompany.owner}</strong></div>
              </div>

              <div style={{ marginTop: '20px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '11px', color: '#475569', textTransform: 'uppercase', fontWeight: '700' }}>Associated Firm Contacts</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {contacts.filter(con => con.companyId === currentViewCompany.id).map(con => (
                    <div key={con.id} onClick={() => setCurrentViewContact(con)} style={{ padding: '8px 12px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600', color: '#0284c7' }}>
                      {con.name} ({con.jobTitle})
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px', overflowY: 'auto', gap: '24px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Log Assessment Feedback / Activity</h3>
                <form onSubmit={(e) => handleAddUnifiedNote(e, 'company', currentViewCompany.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type feedback notes, updates, or instructions here..." style={{ width: '100%', height: '70px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} style={{ padding: '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Ashley">Ashley</option><option value="Femi">Femi</option>
                      </select>
                      <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ padding: '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Call">📞 Call</option><option value="Meeting">🤝 Meeting</option><option value="Email">✉️ Email</option><option value="Review">📋 Review</option>
                      </select>
                    </div>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: '#475569' }}>
                      <input type="checkbox" checked={noteBookmark} onChange={(e) => setNoteBookmark(e.target.checked)} /> Pinned to Dashboard Checklist
                    </label>
                    <button type="submit" style={{ backgroundColor: '#0284c7', color: 'white', padding: '6px 14px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Save Activity Line</button>
                  </div>
                </form>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Unified Account Activity Stream Logs (Company + Contact Notes Combined)</h3>
                {globalNotes.filter(n => (n.targetType === 'company' && n.targetId === currentViewCompany.id) || (n.targetType === 'contact' && contacts.find(c => c.id === n.targetId)?.companyId === currentViewCompany.id)).map(n => (
                  <div key={n.id} style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#ffffff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 6px', backgroundColor: n.targetType === 'contact' ? '#fee2e2' : '#f0f9ff', color: n.targetType === 'contact' ? '#991b1b' : '#0369a1', borderRadius: '4px' }}>
                        {n.targetType === 'contact' ? `👤 Contact Note: ${contacts.find(c => c.id === n.targetId)?.name}` : '🏢 Corporate Account Activity Line'}
                      </span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{n.date}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: '1.4' }}>{n.text}</p>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>Logged By: <strong>{n.author}</strong> | Category: <span style={{ textTransform: 'uppercase', fontWeight: 'bold' }}>{n.type}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : currentViewContact && !currentViewProperty && !currentViewCompany && activeTab !== 'contacts' ? (
          // ==================== CONTACT FULL WORKSPACE ROSTER EXPANSION ====================
          <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#ffffff' }}>
            <div style={{ width: '300px', borderRight: '1px solid #e2e8f0', padding: '32px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <button onClick={() => setCurrentViewContact(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}><ArrowLeft size={14} /> Back to Roster</button>
              <div>
                <h2 style={{ margin: '12px 0 4px 0', fontSize: '20px' }}>{currentViewContact.name}</h2>
                <div style={{ fontSize: '13px', color: '#475569', fontWeight: '600' }}>{currentViewContact.jobTitle}</div>
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px', color: '#334155' }}>
                <div>📧 Email: <strong>{currentViewContact.email}</strong></div>
                <div>📞 Mobile: <strong>{currentViewContact.phone}</strong></div>
                <div>Origin Sourced: <strong>{currentViewContact.origin}</strong></div>
                <div>Account Owner: <strong>{currentViewContact.owner}</strong></div>
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '32px', overflowY: 'auto', gap: '24px' }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Log Custom Note for Contact Profile</h3>
                <form onSubmit={(e) => handleAddUnifiedNote(e, 'contact', currentViewContact.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type background profile updates or tracking notes..." style={{ width: '100%', height: '70px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} style={{ padding: '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Ashley">Ashley</option><option value="Femi">Femi</option>
                      </select>
                      <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ padding: '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Call">📞 Call</option><option value="Meeting">🤝 Meeting</option><option value="Email">✉️ Email</option><option value="Review">📋 Review</option>
                      </select>
                    </div>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="checkbox" checked={noteBookmark} onChange={(e) => setNoteBookmark(e.target.checked)} /> Pin to Dashboard Secure Checklist
                    </label>
                    <button type="submit" style={{ backgroundColor: '#0f172a', color: 'white', padding: '6px 14px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Append Note Profile</button>
                  </div>
                </form>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 'bold' }}>Contact Communication Logs</h3>
                {globalNotes.filter(n => n.targetType === 'contact' && n.targetId === currentViewContact.id).map(n => (
                  <div key={n.id} style={{ padding: '14px', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#ffffff' }}>
                    <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>{n.text}</p>
                    <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>{n.date} | Logged by: <strong>{n.author}</strong> | Category: <strong>{n.type}</strong></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // ==================== PORTAL ROOT TAB CHANNELS SPREADSHEETS ====================
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', minHeight: isMobile ? '52px' : '70px', display: 'flex', alignItems: 'center', padding: isMobile ? '0 14px' : '0 32px', justifyContent: 'space-between', flexShrink: 0 }}>
              <h1 style={{ fontSize: isMobile ? '15px' : '20px', fontWeight: 'bold', color: '#0f172a', margin: 0, display: isMobile ? 'none' : 'block' }}>
                {activeTab === 'dashboard' && '📊 Master Executive Overview Deck'}
                {activeTab === 'pipeline' && '🏠 Live Property Tracker Pipeline'}
                {activeTab === 'scraper' && '🔎 Automated Auction Batch Scraper Logs'}
                {activeTab === 'surveyors' && '📋 Surveyor Intelligence Hub'}
                {activeTab === 'auctionintel' && '📈 Auction Intelligence & Watchlist'}
                {activeTab === 'companies' && '🏢 Linked Corporate Accounts Engine'}
                {activeTab === 'contacts' && '👥 Sourcing Contacts Profile Roster'}
                {activeTab === 'dealanalysis' && '📊 Deal Analysis & Scenario Matrix'}
                {activeTab === 'tasks' && '✅ Tasks & Follow-ups'}
                {activeTab === 'settings' && '⚙️ System Settings & Preferences'}
              </h1>
              {/* Global search */}
              <div style={{ position: 'relative', flex: 1, maxWidth: '280px', margin: '0 20px' }}>
                <Search size={13} style={{ position: 'absolute', top: '9px', left: '9px', color: '#94a3b8', pointerEvents: 'none' }} />
                <input
                  placeholder="Search properties, companies, contacts…"
                  value={globalSearch}
                  onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  style={{ width: '100%', padding: '7px 7px 7px 28px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }}
                />
                {showSearchResults && (() => {
                  const q = globalSearch.toLowerCase();
                  const propResults = properties.filter(p => (p.address || '').toLowerCase().includes(q) || (p.dealName || '').toLowerCase().includes(q)).slice(0, 5);
                  const coResults = companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3);
                  const conResults = contacts.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3);
                  const hasResults = propResults.length + coResults.length + conResults.length > 0;
                  return (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 200, marginTop: '4px', maxHeight: '320px', overflowY: 'auto' }}>
                      {!hasResults && <div style={{ padding: '12px 14px', fontSize: '12px', color: '#94a3b8' }}>No results</div>}
                      {propResults.length > 0 && <div style={{ padding: '5px 14px', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>Properties</div>}
                      {propResults.map(p => (
                        <div key={p.id} onMouseDown={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); setGlobalSearch(''); setShowSearchResults(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                          <span style={{ fontWeight: '500', color: '#0f172a' }}>{p.dealName || p.address.split(',')[0]}</span>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: getStatusStyle(p.status || 'Sourced').bg, color: getStatusStyle(p.status || 'Sourced').color, fontWeight: '600' }}>{p.status || 'Sourced'}</span>
                        </div>
                      ))}
                      {coResults.length > 0 && <div style={{ padding: '5px 14px', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>Companies</div>}
                      {coResults.map(c => (
                        <div key={c.id} onMouseDown={() => { setActiveTab('companies'); setCurrentViewCompany(c); setGlobalSearch(''); setShowSearchResults(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                          <span style={{ fontWeight: '500', color: '#0f172a' }}>{c.name}</span>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{c.type}</span>
                        </div>
                      ))}
                      {conResults.length > 0 && <div style={{ padding: '5px 14px', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', backgroundColor: '#f8fafc' }}>Contacts</div>}
                      {conResults.map(c => (
                        <div key={c.id} onMouseDown={() => { setActiveTab('contacts'); setCurrentViewContact(c); setGlobalSearch(''); setShowSearchResults(false); }} style={{ padding: '8px 14px', cursor: 'pointer', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.backgroundColor = ''}>
                          <span style={{ fontWeight: '500', color: '#0f172a' }}>{c.name}</span>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>{c.jobTitle || c.role || '—'}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div style={{ fontSize: '11px', color: saveStatus === 'saving' ? '#94a3b8' : '#059669', display: 'flex', alignItems: 'center', gap: '5px', minWidth: '60px', justifyContent: 'flex-end' }}>
                {saveStatus === 'saving' && <><div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#94a3b8', animation: 'pulse 1s infinite' }} />Saving…</>}
                {saveStatus === 'saved' && <><CheckCircle2 size={12} />Saved</>}
              </div>
            </header>

            <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '32px' }}>
              
              {activeTab === 'dashboard' && (() => {
                const today = new Date();
                const upcomingBids = properties.filter(p => p.planningToBid || p.isConsideration).sort((a, b) => new Date(a.auctionDate) - new Date(b.auctionDate));
                const nextBid = upcomingBids[0];
                const daysUntil = nextBid ? Math.ceil((new Date(nextBid.auctionDate) - today) / 86400000) : null;
                const countdownLabel = daysUntil === null ? '—' : daysUntil === 0 ? 'Today' : daysUntil < 0 ? 'Past' : `${daysUntil}d`;
                const strongBids = properties.filter(p => p.isStrongBid);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Stat row */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '14px' }}>
                      <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Active lots</div>
                        <div style={{ fontSize: '26px', fontWeight: '600', color: '#0f172a' }}>{totalDeals}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{strongBidCount} strong bid{strongBidCount !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ backgroundColor: daysUntil === 0 ? '#f0fdf4' : '#ffffff', padding: '18px 20px', borderRadius: '12px', border: `1px solid ${daysUntil === 0 ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: `3px solid #059669` }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Next auction</div>
                        <div style={{ fontSize: '22px', fontWeight: '600', color: '#059669' }}>{countdownLabel}</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{nextBid ? `${nextBid.auctionTime || ''} · ${nextBid.sourcePlatform}` : 'No upcoming bids'}</div>
                      </div>
                      <div style={{ backgroundColor: unreviewedScrapedCount > 0 ? '#fffbeb' : '#ffffff', padding: '18px 20px', borderRadius: '12px', border: `1px solid ${unreviewedScrapedCount > 0 ? '#fde68a' : '#e2e8f0'}`, borderLeft: `3px solid ${unreviewedScrapedCount > 0 ? '#f59e0b' : '#e2e8f0'}` }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>New listings</div>
                        <div style={{ fontSize: '26px', fontWeight: '600', color: unreviewedScrapedCount > 0 ? '#f59e0b' : '#94a3b8' }}>{unreviewedScrapedCount}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Unreviewed batches</div>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>Today's max bid</div>
                        <div style={{ fontSize: '22px', fontWeight: '600', color: '#0f172a' }}>{nextBid && daysUntil === 0 ? `£${nextBid.maxBid?.toLocaleString()}` : '—'}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{nextBid && daysUntil === 0 ? nextBid.address.split(',')[0] : 'No auction today'}</div>
                      </div>
                    </div>

                    {/* Main grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '16px' }}>

                      {/* LEFT — Upcoming bids + critical notes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px', fontWeight: '600' }}>Upcoming bids</div>
                          {upcomingBids.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No upcoming bids — star a property and mark Planning to Bid</div>}
                          {upcomingBids.map(p => {
                            const days = Math.ceil((new Date(p.auctionDate) - today) / 86400000);
                            const urgent = days <= 3;
                            const criticalNotes = p.notesList?.filter(n => n.bookmarked && !n.done) || [];
                            return (
                              <div key={p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); }} style={{ border: `1px solid ${p.isStrongBid ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: `3px solid ${p.isStrongBid ? '#059669' : '#94a3b8'}`, borderRadius: '8px', padding: '12px', marginBottom: '10px', cursor: 'pointer', backgroundColor: p.isStrongBid ? '#fafffe' : '#ffffff' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{p.address.split(',')[0]}</div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.sourcePlatform} · {p.auctionDate} {p.auctionTime ? `· ${p.auctionTime}` : ''}</div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '12px', backgroundColor: urgent ? '#fef2f2' : '#f1f5f9', color: urgent ? '#dc2626' : '#475569' }}>{days === 0 ? 'Today' : days < 0 ? 'Past' : `${days}d`}</div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {p.isStrongBid && <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#166534' }}>Strong bid</span>}
                                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', backgroundColor: getStatusStyle(p.status || 'Sourced').bg, color: getStatusStyle(p.status || 'Sourced').color }}>{p.status || 'Sourced'}</span>
                                  </div>
                                  <div style={{ fontSize: '14px', fontWeight: '600', color: '#059669' }}>£{p.maxBid?.toLocaleString()}</div>
                                </div>
                                {criticalNotes.length > 0 && (
                                  <div style={{ marginTop: '8px', padding: '6px 8px', backgroundColor: '#fffbeb', borderRadius: '6px', fontSize: '11px', color: '#92400e', border: '1px solid #fde68a' }}>
                                    {criticalNotes[0].text}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Critical notes */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                          <div onClick={() => setIsDashTasksExpanded(!isDashTasksExpanded)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: isDashTasksExpanded ? '12px' : 0 }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600' }}>Pinned tasks & notes ({dashboardBookmarkedTasks.length})</div>
                            {isDashTasksExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                          {isDashTasksExpanded && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {dashboardBookmarkedTasks.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>No pinned tasks yet — bookmark a note to see it here</div>}
                              {dashboardBookmarkedTasks.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: t.done ? '#f8fafc' : '#ffffff' }}>
                                  <input type="checkbox" checked={t.done} onChange={() => t.originType === 'Property' ? toggleNoteTaskState(t.propertyId, t.id) : toggleGlobalNoteState(parseInt(t.id.replace('global-', '')))} style={{ cursor: 'pointer', marginTop: '2px' }} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '12px', color: t.done ? '#94a3b8' : '#0f172a', textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{t.propName} · {t.originType}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* RIGHT — Strong bid opportunities + new listings */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                        {/* Strong bid opportunities */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600' }}>Strong bid opportunities</div>
                            <span style={{ fontSize: '11px', fontWeight: '700', backgroundColor: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '10px' }}>{strongBidCount} active</span>
                          </div>
                          <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '2px' }}>
                            {strongBids.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '24px 0' }}>No strong bids yet — mark a property as Strong Bid in the pipeline</div>}
                            {strongBids.map(p => {
                              const days = Math.ceil((new Date(p.auctionDate) - today) / 86400000);
                              return (
                                <div key={p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); }} style={{ border: '1px solid #bbf7d0', borderLeft: '3px solid #059669', borderRadius: '8px', padding: '11px 12px', cursor: 'pointer', backgroundColor: '#fafffe', transition: 'background 0.15s' }}
                                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f0fdf4'}
                                  onMouseLeave={e => e.currentTarget.style.backgroundColor = '#fafffe'}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.address.split(',')[0]}</div>
                                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.sourcePlatform} · {p.auctionDate}</div>
                                    </div>
                                    <div style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '10px', backgroundColor: days <= 3 ? '#fef2f2' : '#f1f5f9', color: days <= 3 ? '#dc2626' : '#475569', flexShrink: 0, marginLeft: '8px' }}>
                                      {days === 0 ? 'Today' : days < 0 ? 'Past' : `${days}d`}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Guide: £{p.guidePrice?.toLocaleString()}</div>
                                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#059669' }}>Max £{p.maxBid?.toLocaleString()}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Pipeline summary */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '12px' }}>Pipeline summary</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {[['Total lots', properties.length, '#0f172a'], ['Bidding', properties.filter(p => p.status === 'Bidding').length, '#059669'], ['Surveying', properties.filter(p => p.status === 'Surveying').length, '#f59e0b'], ['Researching', properties.filter(p => p.status === 'Researching' || p.status === 'Research Completed').length, '#1d4ed8'], ['Won', properties.filter(p => p.status === 'Won').length, '#065f46'], ['Lost', properties.filter(p => p.status === 'Lost').length, '#dc2626']].map(([label, count, color]) => (
                              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '0.5px solid #f1f5f9' }}>
                                <span style={{ fontSize: '12px', color: '#64748b' }}>{label}</span>
                                <span style={{ fontSize: '13px', fontWeight: '600', color }}>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* New listings */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '12px' }}>New listings detected</div>
                          {scrapedAuctions.filter(s => !s.reviewed).length === 0
                            ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>All batches reviewed</div>
                            : scrapedAuctions.filter(s => !s.reviewed).map(s => (
                              <div key={s.id} onClick={() => setActiveTab('scraper')} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', marginBottom: '6px', cursor: 'pointer' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#059669', flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: '12px', color: '#065f46', fontWeight: '500' }}>{s.platform}</div>
                                  <div style={{ fontSize: '10px', color: '#64748b' }}>{s.totalLotsFound} lots · {s.auctionDate}</div>
                                </div>
                                <ChevronRight size={12} style={{ color: '#059669' }} />
                              </div>
                            ))
                          }
                        </div>

                        {/* Pinned notes */}
                        <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '12px' }}>Pinned notes ({dashboardBookmarkedTasks.length})</div>
                          {dashboardBookmarkedTasks.length === 0
                            ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>Bookmark a note in any property to pin it here</div>
                            : <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '180px', overflowY: 'auto' }}>
                              {dashboardBookmarkedTasks.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '7px', backgroundColor: t.done ? '#f8fafc' : '#ffffff' }}>
                                  <input type="checkbox" checked={t.done} onChange={() => t.originType === 'Property' ? toggleNoteTaskState(t.propertyId, t.id) : toggleGlobalNoteState(parseInt(t.id.replace('global-', '')))} style={{ cursor: 'pointer', marginTop: '2px', flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: '12px', color: t.done ? '#94a3b8' : '#0f172a', textDecoration: t.done ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.text}</div>
                                    {t.propertyAddress && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{t.propertyAddress.split(',')[0]}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          }
                        </div>

                      </div>
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'pipeline' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* URL Scraper bar */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 14px' }}>
                    <Link2 size={14} style={{ color: '#64748b', flexShrink: 0 }} />
                    <input value={pipelineUrl} onChange={e => setPipelineUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleScrapeUrl()} placeholder="Paste auction listing URL to auto-import address, price, beds & date…" style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', outline: 'none', color: '#0f172a' }} />
                    <button onClick={handleScrapeUrl} disabled={urlScraping || !pipelineUrl.trim()} style={{ padding: '6px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: urlScraping ? 'wait' : 'pointer', opacity: !pipelineUrl.trim() ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                      {urlScraping ? 'Importing…' : 'Import'}
                    </button>
                  </div>

                  {/* Toolbar */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {!isMobile && <button onClick={() => setPipelineView('kanban')} style={{ padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid', backgroundColor: pipelineView === 'kanban' ? '#0f172a' : '#ffffff', color: pipelineView === 'kanban' ? '#ffffff' : '#475569', borderColor: pipelineView === 'kanban' ? '#0f172a' : '#e2e8f0' }}>Board</button>}
                      {!isMobile && <button onClick={() => setPipelineView('table')} style={{ padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid', backgroundColor: pipelineView === 'table' ? '#0f172a' : '#ffffff', color: pipelineView === 'table' ? '#ffffff' : '#475569', borderColor: pipelineView === 'table' ? '#0f172a' : '#e2e8f0' }}>Table</button>}
                      <button onClick={() => setShowMapView(true)} title="Map view" style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}><Map size={14} /> Map</button>
                      <button onClick={() => setShowPipelineFilters(f => !f)} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${showPipelineFilters ? '#059669' : '#e2e8f0'}`, backgroundColor: showPipelineFilters ? '#f0fdf4' : '#ffffff', color: showPipelineFilters ? '#059669' : '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}><Filter size={14} /> Filters</button>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {!isMobile && <label style={{ backgroundColor: '#059669', color: 'white', padding: '7px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Upload size={14} /> Upload Report
                        <input type="file" accept=".pdf,.html,.htm" onChange={handleIncomingFileIngest} style={{ display: 'none' }} />
                      </label>}
                      <button onClick={() => { const ah = companies.filter(c => c.type === 'Auction House'); setNewPropPlatform(ah[0]?.name || ''); setNewPropAddress(''); setNewPropGuide(''); setNewPropDate(''); setNewPropType('Residential'); setShowAddPropertyModal(true); }} style={{ padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Plus size={14} /> {isMobile ? 'Add' : 'Add manually'}
                      </button>
                    </div>
                  </div>

                  {/* Filter panel */}
                  {showPipelineFilters && (
                    <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>SORT</div>
                        <select value={pipelineSort} onChange={e => setPipelineSort(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff' }}>
                          <option value="newest">Newest added</option>
                          <option value="priceAsc">Price: low → high</option>
                          <option value="priceDesc">Price: high → low</option>
                          <option value="dateAsc">Auction date: soonest</option>
                          <option value="dateDesc">Auction date: latest</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>PROPERTY TYPE</div>
                        <select value={pipelineTypeFilter} onChange={e => setPipelineTypeFilter(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff' }}>
                          <option value="ALL">All types</option>
                          <option value="Terraced">Terraced</option>
                          <option value="Semi-detached">Semi-detached</option>
                          <option value="Detached">Detached</option>
                          <option value="Flat">Flat</option>
                          <option value="Bungalow">Bungalow</option>
                          <option value="Commercial">Commercial</option>
                          <option value="Land">Land</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>DEAL STAGE</div>
                        <select value={pipelineStageFilter} onChange={e => setPipelineStageFilter(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff' }}>
                          <option value="ALL">All stages</option>
                          {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>AUCTION DATE FROM</div>
                        <input type="date" value={pipelineDateFrom} onChange={e => setPipelineDateFrom(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>TO</div>
                        <input type="date" value={pipelineDateTo} onChange={e => setPipelineDateTo(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      </div>
                      <button onClick={() => { setPipelineSort('newest'); setPipelineTypeFilter('ALL'); setPipelineStageFilter('ALL'); setPipelineDateFrom(''); setPipelineDateTo(''); }} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: '#fff', fontSize: '12px', cursor: 'pointer', color: '#64748b' }}>Clear</button>
                    </div>
                  )}

                  {/* KANBAN VIEW */}
                  {pipelineView === 'kanban' && (
                    <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px', alignItems: 'flex-start', WebkitOverflowScrolling: 'touch', scrollSnapType: isMobile ? 'x mandatory' : 'none' }}>
                      {PIPELINE_STAGES.map(stage => {
                        const cols = STAGE_COLOURS[stage];
                        const stageProp = pipelineProperties.filter(p => normaliseStatus(p.status) === stage);
                        const isCollapsed = collapsedStages.includes(stage);
                        return (
                          <div key={stage}
                            onDragOver={e => { e.preventDefault(); if (dragOverStage !== stage) setDragOverStage(stage); }}
                            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverStage(null); }}
                            onDrop={e => {
                              e.preventDefault();
                              const pid = parseInt(e.dataTransfer.getData('propId'));
                              if (!pid) return;
                              setProperties(prev => prev.map(p => {
                                if (p.id !== pid || normaliseStatus(p.status) === stage) return p;
                                const moved = withActivity(p, 'stage', `Stage changed: ${normaliseStatus(p.status)} → ${stage}`);
                                moved.status = stage;
                                if (currentViewProperty && currentViewProperty.id === pid) setCurrentViewProperty(moved);
                                return moved;
                              }));
                              setDraggedPropId(null);
                              setDragOverStage(null);
                            }}
                            style={{ minWidth: isMobile ? 'calc(85vw - 20px)' : isCollapsed ? '48px' : '200px', maxWidth: isMobile ? 'calc(85vw - 20px)' : isCollapsed ? '48px' : '220px', background: dragOverStage === stage && draggedPropId ? cols.border : cols.bg, border: `${dragOverStage === stage && draggedPropId ? '2px' : '1px'} solid ${cols.border}`, borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0, transition: 'min-width 0.2s, max-width 0.2s, background 0.15s, border 0.15s', scrollSnapAlign: isMobile ? 'start' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setCollapsedStages(prev => prev.includes(stage) ? prev.filter(s => s !== stage) : [...prev, stage])}>
                              {isCollapsed ? (
                                <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: '9px', fontWeight: '700', textTransform: 'uppercase', color: cols.head, padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{stage}</span><span style={{ fontSize: '9px', padding: '1px 4px', borderRadius: '6px', background: cols.border, color: cols.head }}>{stageProp.length}</span>
                                </div>
                              ) : (
                                <>
                                  <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', color: cols.head }}>{stage}</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: cols.border, color: cols.head, fontWeight: '700' }}>{stageProp.length}</span>
                                    <ChevronLeft size={12} style={{ color: cols.head }} />
                                  </div>
                                </>
                              )}
                            </div>
                            {!isCollapsed && (
                              <>
                                {stageProp.length === 0 && <div style={{ fontSize: '10px', color: '#cbd5e1', textAlign: 'center', padding: '14px 0' }}>Empty</div>}
                                {stageProp.map(p => {
                                  const countdown = getCountdown(p.auctionDate);
                                  const urgent = ['Today','1d','2d','3d'].includes(countdown);
                                  return (
                                    <div key={p.id}
                                      draggable
                                      onDragStart={e => { e.dataTransfer.setData('propId', p.id); setDraggedPropId(p.id); }}
                                      onDragEnd={() => setDraggedPropId(null)}
                                      onClick={() => setCurrentViewProperty(p)}
                                      style={{ background: draggedPropId === p.id ? '#f0fdf4' : '#ffffff', border: `0.5px solid ${cols.border}`, borderLeft: p.isStrongBid ? '3px solid #059669' : `0.5px solid ${cols.border}`, borderRadius: p.isStrongBid ? '0 7px 7px 0' : '7px', padding: '10px', cursor: 'grab', opacity: draggedPropId === p.id ? 0.5 : 1 }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', flex: 1, marginRight: '4px' }}>{p.dealName || p.address.split(',')[0]}</div>
                                        <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '8px', backgroundColor: getStatusStyle(stage).bg, color: getStatusStyle(stage).color, fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap' }}>{stage}</span>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px' }}>{p.sourcePlatform}</div>
                                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>£{(p.guidePrice || 0).toLocaleString()}</div>
                                      {p.bedrooms > 0 && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.bedrooms} bed · {p.auctionDate}</div>}
                                      {!p.bedrooms && p.auctionDate && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.auctionDate}</div>}
                                      {countdown && <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {p.isStrongBid && <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', background: '#dcfce7', color: '#166534' }}>Strong bid</span>}
                                        <span style={{ marginLeft: 'auto', fontSize: '9px', padding: '1px 6px', borderRadius: '8px', background: urgent ? '#fef2f2' : '#f1f5f9', color: urgent ? '#dc2626' : '#475569', fontWeight: '600' }}>{countdown}</span>
                                      </div>}
                                      <div style={{ marginTop: '4px', display: 'flex', justifyContent: 'flex-end' }}>
                                        <span onClick={e => { e.stopPropagation(); handleDeleteProperty(p.id); }} style={{ cursor: 'pointer' }}><Trash2 size={11} style={{ color: '#fca5a5' }} /></span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* TABLE VIEW */}
                  {(pipelineView === 'table' || isMobile) && (
                    <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                      {isMobile ? (
                        <div style={{ padding: '8px' }}>
                          {pipelineProperties.map(p => {
                            const days = p.auctionDate ? Math.ceil((new Date(p.auctionDate) - new Date()) / 86400000) : null;
                            const st = getStatusStyle(p.status || 'Sourced');
                            return (
                              <div key={p.id} onClick={() => setCurrentViewProperty(p)} style={{ display: 'flex', gap: '12px', padding: '12px', borderRadius: '8px', border: `1px solid ${p.isStrongBid ? '#bbf7d0' : '#e2e8f0'}`, borderLeft: `3px solid ${p.isStrongBid ? '#059669' : '#cbd5e1'}`, marginBottom: '8px', background: p.isStrongBid ? '#fafffe' : '#fff', cursor: 'pointer' }}>
                                <button onClick={e => { e.stopPropagation(); toggleConsideration(p.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, alignSelf: 'flex-start', marginTop: '2px' }}><Star size={16} fill={p.isConsideration ? '#eab308' : 'none'} color={p.isConsideration ? '#eab308' : '#cbd5e1'} /></button>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: st.bg, color: st.color, fontWeight: '600' }}>{p.status || 'Sourced'}</span>
                                    {p.propertyType && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: '500' }}>{p.propertyType}</span>}
                                  </div>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>Guide: <b style={{ color: '#0f172a' }}>£{(p.guidePrice || 0).toLocaleString()}</b>{p.maxBid > 0 ? <> · Max: <b style={{ color: '#059669' }}>£{p.maxBid.toLocaleString()}</b></> : ''}</div>
                                    {days !== null && <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 7px', borderRadius: '10px', backgroundColor: days <= 3 && days >= 0 ? '#fef2f2' : '#e0f2fe', color: days <= 3 && days >= 0 ? '#dc2626' : '#0369a1' }}>{days === 0 ? 'Today' : days < 0 ? 'Past' : `${days}d`}</span>}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {pipelineProperties.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No properties yet</div>}
                        </div>
                      ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '12px 16px', width: '36px', textAlign: 'center' }}><Star size={13} /></th>
                              <th style={{ padding: '12px 16px' }}>Address</th>
                              <th style={{ padding: '12px 16px' }}>Type</th>
                              <th style={{ padding: '12px 16px' }}>Platform</th>
                              <th style={{ padding: '12px 16px' }}>Guide</th>
                              <th style={{ padding: '12px 16px' }}>Max bid</th>
                              <th style={{ padding: '12px 16px' }}>Auction date</th>
                              <th style={{ padding: '12px 16px' }}>Countdown</th>
                              <th style={{ padding: '12px 16px' }}>Stage</th>
                              <th style={{ padding: '12px 16px', textAlign: 'center' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {pipelineProperties.map(p => (
                              <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: p.isStrongBid ? '#fafffe' : '#ffffff' }} onClick={() => setCurrentViewProperty(p)}>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => { e.stopPropagation(); toggleConsideration(p.id); }}><Star size={14} fill={p.isConsideration ? '#eab308' : 'none'} color={p.isConsideration ? '#eab308' : '#cbd5e1'} /></td>
                                <td style={{ padding: '12px 16px', fontWeight: '600', color: '#0284c7' }}>{p.address}</td>
                                <td style={{ padding: '12px 16px', color: '#475569', fontSize: '12px' }}>{p.propertyType || '—'}</td>
                                <td style={{ padding: '12px 16px', color: '#475569', fontSize: '12px' }}>{p.sourcePlatform}</td>
                                <td style={{ padding: '12px 16px', fontWeight: '600' }}>£{(p.guidePrice || 0).toLocaleString()}</td>
                                <td style={{ padding: '12px 16px', fontWeight: '600', color: '#059669' }}>{p.maxBid > 0 ? `£${p.maxBid?.toLocaleString()}` : '—'}</td>
                                <td style={{ padding: '12px 16px', color: '#334155', fontSize: '12px' }}>{p.auctionDate}</td>
                                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: getCountdown(p.auctionDate) === 'Past' ? '#f1f5f9' : '#e0f2fe', color: getCountdown(p.auctionDate) === 'Past' ? '#94a3b8' : '#0369a1' }}>{getCountdown(p.auctionDate)}</span></td>
                                <td style={{ padding: '12px 16px' }}><span style={{ padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: getStatusStyle(p.status || 'Sourced').bg, color: getStatusStyle(p.status || 'Sourced').color }}>{p.status || 'Sourced'}</span></td>
                                <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => { e.stopPropagation(); handleDeleteProperty(p.id); }}><Trash2 size={14} style={{ color: '#ef4444', cursor: 'pointer' }} /></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      )}
                    </div>
                  )}

                  {/* MAP MODAL */}
                  {showMapView && (() => {
                    const geocodedProps = pipelineProperties.filter(p => mapGeoCache[p.id]);
                    const ungeocodedProps = pipelineProperties.filter(p => !mapGeoCache[p.id]);
                    // Trigger geocoding for uncoded props
                    ungeocodedProps.slice(0, 5).forEach(p => geocodeAddress(p.address, p.id));
                    const center = geocodedProps.length > 0
                      ? [mapGeoCache[geocodedProps[0].id]?.lat || 53.3811, mapGeoCache[geocodedProps[0].id]?.lng || -1.4701]
                      : [53.3811, -1.4701]; // default: Sheffield
                    return (
                      <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px' }}>
                        <div style={{ backgroundColor: '#fff', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '15px', fontWeight: '600' }}>Pipeline Map — {pipelineProperties.length} properties</div>
                            <button onClick={() => setShowMapView(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}><X size={20} /></button>
                          </div>
                          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                              <MapContainer center={center} zoom={geocodedProps.length > 0 ? 11 : 6} style={{ height: '100%', width: '100%', borderRadius: 0 }}>
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© OpenStreetMap' />
                                {geocodedProps.map(p => {
                                  const coords = mapGeoCache[p.id];
                                  if (!coords) return null;
                                  return (
                                    <Marker key={p.id} position={[coords.lat, coords.lng]}>
                                      <Popup>
                                        <div style={{ fontSize: '12px', minWidth: '150px' }}>
                                          <div style={{ fontWeight: '700', marginBottom: '4px' }}>{p.address.split(',')[0]}</div>
                                          <div style={{ color: '#059669', fontWeight: '600' }}>£{(p.guidePrice || 0).toLocaleString()}</div>
                                          <div style={{ color: '#64748b', marginTop: '2px' }}>{p.status || 'Sourced'} · {p.auctionDate}</div>
                                          <button onClick={() => { setCurrentViewProperty(p); setShowMapView(false); }} style={{ marginTop: '6px', padding: '3px 8px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}>Open property</button>
                                        </div>
                                      </Popup>
                                    </Marker>
                                  );
                                })}
                              </MapContainer>
                            </div>
                            <div style={{ width: '240px', overflowY: 'auto', borderLeft: '1px solid #e2e8f0', padding: '12px' }}>
                              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>All Properties</div>
                              {pipelineProperties.map(p => (
                                <div key={p.id} onClick={() => { setCurrentViewProperty(p); setShowMapView(false); }} style={{ padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '6px', cursor: 'pointer', backgroundColor: mapGeoCache[p.id] ? '#f0fdf4' : '#f8fafc' }}>
                                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a' }}>{p.address.split(',')[0]}</div>
                                  <div style={{ fontSize: '10px', color: '#059669', fontWeight: '600' }}>£{(p.guidePrice || 0).toLocaleString()}</div>
                                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.status || 'Sourced'}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ==================== TAB: SCRAPER (Option B — table) ==================== */}
              {activeTab === 'scraper' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* South Yorkshire live scan */}
                  <div style={{ backgroundColor: '#0f172a', borderRadius: '12px', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: '700', color: '#ffffff' }}>South Yorkshire — July 2026 Auction Scan</div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Scans Auction House Yorkshire, SDL, Mark Jenkinson, Pugh, Allsop for Sheffield &amp; Doncaster lots</div>
                      </div>
                      <button onClick={async () => {
                        setAuctionScanLoading(true); setAuctionScanResults(null);
                        try {
                          const token = localStorage.getItem('crm_session');
                          const res = await fetch('/api/scrape-auctions', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
                          const data = await res.json();
                          setAuctionScanResults(data.results || []);
                        } catch { setAuctionScanResults([]); }
                        setAuctionScanLoading(false);
                      }} disabled={auctionScanLoading} style={{ backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '8px', padding: '10px 18px', fontWeight: '700', fontSize: '12px', cursor: auctionScanLoading ? 'not-allowed' : 'pointer', opacity: auctionScanLoading ? 0.7 : 1, flexShrink: 0 }}>
                        {auctionScanLoading ? '⏳ Scanning…' : '🔍 Scan Now'}
                      </button>
                    </div>

                    {auctionScanResults && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ fontSize: '10px', color: '#475569', backgroundColor: '#1e293b', borderRadius: '6px', padding: '8px 12px', borderLeft: '3px solid #64748b' }}>
                          ℹ️ Most auction sites use bot-protection (Cloudflare) that blocks server-side scans. Where access is blocked, use <strong style={{ color: '#94a3b8' }}>Visit site</strong> to check manually.
                        </div>
                        {auctionScanResults.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>No results returned.</div>}
                        {auctionScanResults.map((r, i) => {
                          const errMsg = r.error
                            ? (r.error.includes('403') || r.error.includes('401') ? '🚫 Blocked by bot protection — visit manually'
                              : r.error.includes('404') ? '🔗 Page not found — URL may have changed'
                              : r.error.toLowerCase().includes('timeout') || r.error.toLowerCase().includes('abort') ? '⏱️ Site timed out'
                              : `⚠️ Could not access — ${r.error}`)
                            : null;
                          return (
                            <div key={i} style={{ backgroundColor: '#1e293b', borderRadius: '8px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', borderLeft: `3px solid ${r.error ? '#f59e0b' : r.syMentions > 0 ? '#059669' : '#334155'}` }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#f1f5f9' }}>{r.name}</div>
                                <div style={{ fontSize: '10px', color: r.error ? '#fbbf24' : '#64748b', marginTop: '2px' }}>
                                  {errMsg || `${r.syMentions > 0 ? `✅ ${r.syMentions} S.Yorks mentions` : '❓ No S.Yorks match'} · ${r.hasJuly ? '📅 July dates found' : 'No July dates'} · ~${r.estimatedLots || 0} lots`}
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                <a href={r.diaryUrl} target="_blank" rel="noreferrer" style={{ padding: '5px 10px', backgroundColor: r.error ? '#059669' : '#334155', color: r.error ? '#fff' : '#94a3b8', borderRadius: '5px', fontSize: '10px', fontWeight: '600', textDecoration: 'none' }}>Visit site ↗</a>
                                {!r.error && <button onClick={() => {
                                  setScrapedAuctions(prev => [...prev, { id: Date.now() + i, platform: r.name, scrapedDate: new Date().toISOString().split('T')[0], auctionDate: r.auctionDate || '2026-07-??', diaryUrl: r.diaryUrl, totalLotsFound: r.estimatedLots || 0, reviewed: false }]);
                                }} style={{ padding: '5px 10px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}>+ Add to log</button>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Add row form */}
                  <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      if (!newScraperPlatform.trim() || !newScraperDate) return;
                      setScrapedAuctions([...scrapedAuctions, { id: Date.now(), platform: newScraperPlatform, scrapedDate: new Date().toISOString().split('T')[0], auctionDate: newScraperDate, diaryUrl: newScraperUrl || '#', totalLotsFound: parseInt(newScraperLots) || 0, reviewed: false }]);
                      setNewScraperPlatform(''); setNewScraperDate(''); setNewScraperUrl(''); setNewScraperLots('');
                    }} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 1fr 2fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '3px' }}>Platform</label>
                        <input type="text" placeholder="Auction House / Platform" value={newScraperPlatform} onChange={e => setNewScraperPlatform(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '3px' }}>Auction date</label>
                        <input type="date" value={newScraperDate} onChange={e => setNewScraperDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '3px' }}>Diary URL</label>
                        <input type="text" placeholder="Optional URL" value={newScraperUrl} onChange={e => setNewScraperUrl(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', display: 'block', marginBottom: '3px' }}>Lots found</label>
                        <input type="number" placeholder="0" value={newScraperLots} onChange={e => setNewScraperLots(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#0f172a', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Log batch</button>
                    </form>
                  </div>

                  {/* Table */}
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    {scrapedAuctions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                        <Calendar size={28} style={{ marginBottom: '10px', opacity: 0.3 }} />
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>No batches logged yet</div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>Use the form above to log an auction batch</div>
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Platform</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Scraped</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Lots found</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Auction date</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Status</th>
                            <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Review</th>
                            <th style={{ padding: '10px 14px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrapedAuctions.map(sa => {
                            const isEditingLog = editingLogId === sa.id;
                            return (
                              <tr key={sa.id} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: isEditingLog ? '#f0f9ff' : sa.reviewed ? '#fafafa' : '#ffffff' }}>
                                <td style={{ padding: '12px 14px' }}>
                                  {isEditingLog
                                    ? <input defaultValue={sa.platform} id={`log-platform-${sa.id}`} style={{ padding: '5px 8px', border: '1px solid #bae6fd', borderRadius: '5px', fontSize: '12px', width: '120px' }} />
                                    : sa.diaryUrl && sa.diaryUrl !== '#'
                                      ? <a href={sa.diaryUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: '600', color: '#0369a1', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>{sa.platform} <ExternalLink size={11} /></a>
                                      : <span style={{ fontWeight: '600', color: '#0f172a' }}>{sa.platform}</span>
                                  }
                                </td>
                                <td style={{ padding: '12px 14px', color: '#64748b' }}>{sa.scrapedDate || sa.auctionDate}</td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  {isEditingLog
                                    ? <input type="number" defaultValue={sa.totalLotsFound} id={`log-lots-${sa.id}`} style={{ padding: '5px 8px', border: '1px solid #bae6fd', borderRadius: '5px', fontSize: '12px', width: '60px', textAlign: 'center' }} />
                                    : <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: '600' }}>{sa.totalLotsFound}</span>
                                  }
                                </td>
                                <td style={{ padding: '12px 14px', color: '#334155' }}>
                                  {isEditingLog
                                    ? <input type="date" defaultValue={sa.auctionDate} id={`log-date-${sa.id}`} style={{ padding: '5px 8px', border: '1px solid #bae6fd', borderRadius: '5px', fontSize: '12px' }} />
                                    : sa.auctionDate
                                  }
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: sa.reviewed ? '#f1f5f9' : '#fef2f2', color: sa.reviewed ? '#64748b' : '#dc2626', fontWeight: '600' }}>
                                    {sa.reviewed ? 'Reviewed' : 'Pending'}
                                  </span>
                                </td>
                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                  {isEditingLog ? (
                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                      <button onClick={() => { setScrapedAuctions(scrapedAuctions.map(s => s.id === sa.id ? { ...s, platform: document.getElementById(`log-platform-${sa.id}`).value, totalLotsFound: parseInt(document.getElementById(`log-lots-${sa.id}`).value) || 0, auctionDate: document.getElementById(`log-date-${sa.id}`).value } : s)); setEditingLogId(null); }} style={{ padding: '5px 10px', borderRadius: '5px', fontSize: '11px', border: 'none', fontWeight: '600', cursor: 'pointer', backgroundColor: '#0284c7', color: '#fff' }}>Save</button>
                                      <button onClick={() => setEditingLogId(null)} style={{ padding: '5px 8px', borderRadius: '5px', fontSize: '11px', border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#fff', color: '#475569' }}>Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => toggleScrapedReviewedState(sa.id)} style={{ padding: '5px 12px', borderRadius: '5px', fontSize: '11px', border: '1px solid', fontWeight: '600', cursor: 'pointer', backgroundColor: sa.reviewed ? '#f8fafc' : '#0f172a', color: sa.reviewed ? '#475569' : '#ffffff', borderColor: sa.reviewed ? '#e2e8f0' : '#0f172a' }}>
                                      {sa.reviewed ? 'Undo' : 'Mark reviewed'}
                                    </button>
                                  )}
                                </td>
                                <td style={{ padding: '12px 14px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                  {!isEditingLog && <Pencil size={13} style={{ color: '#94a3b8', cursor: 'pointer' }} onClick={() => setEditingLogId(sa.id)} />}
                                  <Trash2 size={13} style={{ color: '#fca5a5', cursor: 'pointer' }} onClick={() => setScrapedAuctions(scrapedAuctions.filter(s => s.id !== sa.id))} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== TAB: SURVEYOR INTELLIGENCE ==================== */}
              {/* ==================== TAB: SURVEYORS (Option C — table) ==================== */}
              {activeTab === 'surveyors' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Stats */}
                  {(() => {
                    const totalJobs = surveyors.reduce((acc, s) => acc + s.ratings.length, 0);
                    const allRatings = surveyors.flatMap(s => s.ratings);
                    const avgCostAll = allRatings.length ? (allRatings.reduce((a, r) => a + r.cost, 0) / allRatings.length).toFixed(0) : '—';
                    const bestSurveyor = surveyors.reduce((best, s) => {
                      if (!s.ratings.length) return best;
                      const avg = s.ratings.reduce((a, r) => a + r.rating, 0) / s.ratings.length;
                      if (!best || avg > best.avg) return { name: s.name, avg };
                      return best;
                    }, null);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                        {[['Registered', surveyors.length, '#0f172a', '#ffffff', '#e2e8f0'], ['Jobs logged', totalJobs, '#0f172a', '#ffffff', '#e2e8f0'], ['Best rated', bestSurveyor?.name || '—', '#065f46', '#f0fdf4', '#bbf7d0'], ['Avg fee', avgCostAll === '—' ? '—' : `£${parseInt(avgCostAll).toLocaleString()}`, '#0f172a', '#ffffff', '#e2e8f0']].map(([label, val, color, bg, border]) => (
                          <div key={label} style={{ backgroundColor: bg, padding: '14px 16px', borderRadius: '10px', border: `1px solid ${border}` }}>
                            <div style={{ fontSize: '10px', color: color === '#0f172a' ? '#64748b' : color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
                            <div style={{ fontSize: '20px', fontWeight: '700', color }}>{val}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Linked jobs from property records */}
                  {(() => {
                    const allLinkedJobs = properties.flatMap(p => (p.surveyJobs || []).map(j => ({ ...j, propertyAddress: p.dealName || p.address, propertyId: p.id })));
                    if (allLinkedJobs.length === 0) return null;
                    return (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f0fdf4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '12px', fontWeight: '700', color: '#065f46' }}>Intelligence from property-linked survey jobs</div>
                          <span style={{ fontSize: '11px', color: '#059669', fontWeight: '600' }}>{allLinkedJobs.length} job{allLinkedJobs.length !== 1 ? 's' : ''} logged</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Surveyor</th>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Property</th>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Booked</th>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Survey date</th>
                              <th style={{ padding: '9px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Report received</th>
                              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Turnaround</th>
                              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Fee</th>
                              <th style={{ padding: '9px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Rating</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allLinkedJobs.sort((a, b) => (b.loggedDate || '').localeCompare(a.loggedDate || '')).map((j, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '10px 14px' }}>
                                  <div style={{ fontWeight: '600', color: '#0f172a' }}>{j.surveyorName}</div>
                                  {j.companyName && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{j.companyName}</div>}
                                </td>
                                <td style={{ padding: '10px 14px', color: '#475569', fontSize: '11px', maxWidth: '160px' }}>
                                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.propertyAddress}</div>
                                </td>
                                <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px' }}>{j.dateBooked || '—'}</td>
                                <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px' }}>{j.surveyDate || '—'}</td>
                                <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px' }}>{j.dateReceived || '—'}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b', fontSize: '11px' }}>
                                  {j.turnaroundRange || (j.turnaroundDays != null && j.turnaroundDays >= 0 ? `${j.turnaroundDays}d` : '—')}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#0f172a' }}>{j.cost > 0 ? `£${j.cost.toLocaleString()}` : '—'}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'center' }}>{j.rating > 0 ? <span style={{ fontWeight: '700', color: '#d97706' }}>{j.rating}★</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Add form */}
                  <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                    <form onSubmit={handleAddSurveyor} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 2fr 1.5fr 2fr 1.5fr auto', gap: '8px', alignItems: 'end' }}>
                      <input type="text" placeholder="Full name" value={newSurveyorName} onChange={e => setNewSurveyorName(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                      <input type="text" placeholder="Company" value={newSurveyorCompany} onChange={e => setNewSurveyorCompany(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                      <input type="text" placeholder="Phone" value={newSurveyorPhone} onChange={e => setNewSurveyorPhone(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                      <input type="email" placeholder="Email" value={newSurveyorEmail} onChange={e => setNewSurveyorEmail(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                      <select value={newSurveyorSpeciality} onChange={e => setNewSurveyorSpeciality(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                        <option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="Structural">Structural</option><option value="Building Survey">Building Survey</option>
                      </select>
                      <button type="submit" style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                    </form>
                  </div>

                  {/* Table */}
                  <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                    {surveyors.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px', color: '#94a3b8' }}>
                        <ClipboardList size={28} style={{ marginBottom: '10px', opacity: 0.3 }} />
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>No surveyors registered yet</div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>Use the form above to add one</div>
                      </div>
                    ) : (
                      <div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Name</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Company</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Avg fee</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Turnaround</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Rating</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Jobs</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Speciality</th>
                              <th style={{ padding: '10px 14px', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {surveyors.map(s => {
                              const avgRating = s.ratings.length ? (s.ratings.reduce((a, r) => a + r.rating, 0) / s.ratings.length).toFixed(1) : null;
                              const avgCost = s.ratings.length ? Math.round(s.ratings.reduce((a, r) => a + r.cost, 0) / s.ratings.length) : null;
                              const avgTurnaround = s.ratings.length ? (s.ratings.reduce((a, r) => a + r.turnaroundDays, 0) / s.ratings.length).toFixed(1) : null;
                              const isLogging = logJobSurveyorId === s.id;
                              const isExpanded = expandedSurveyorId === s.id;
                              return (
                                <React.Fragment key={s.id}>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '12px 14px' }}>
                                      <div style={{ fontWeight: '600', color: '#0f172a' }}>{s.name}</div>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>{s.email}</div>
                                    </td>
                                    <td style={{ padding: '12px 14px', color: '#475569' }}>{s.company}</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: '600', color: '#0f172a' }}>{avgCost ? `£${avgCost.toLocaleString()}` : '—'}</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center', color: '#64748b' }}>{avgTurnaround ? `${avgTurnaround}d` : '—'}</td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                      {avgRating ? <span style={{ fontWeight: '700', color: '#d97706' }}>{avgRating}★</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                                    </td>
                                    <td style={{ padding: '12px 14px', textAlign: 'center' }}><span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#f0fdf4', color: '#166534', fontWeight: '600' }}>{s.ratings.length}</span></td>
                                    <td style={{ padding: '12px 14px' }}><span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', backgroundColor: '#eff6ff', color: '#1d4ed8', fontWeight: '500' }}>{s.speciality}</span></td>
                                    <td style={{ padding: '12px 14px' }}>
                                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                                        <button onClick={() => setLogJobSurveyorId(isLogging ? null : s.id)} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '5px', border: 'none', backgroundColor: '#059669', color: '#fff', cursor: 'pointer', fontWeight: '600' }}>Log job</button>
                                        {s.ratings.length > 0 && <button onClick={() => setExpandedSurveyorId(isExpanded ? null : s.id)} style={{ padding: '4px 10px', fontSize: '11px', borderRadius: '5px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', cursor: 'pointer' }}>{isExpanded ? 'Hide' : 'History'}</button>}
                                        <button onClick={() => { setEditingSurveyorId(editingSurveyorId === s.id ? null : s.id); setEditSurveyorName(s.name); setEditSurveyorCompany(s.company); setEditSurveyorPhone(s.phone || ''); setEditSurveyorEmail(s.email || ''); setEditSurveyorSpeciality(s.speciality || 'Residential'); }} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '5px', border: '1px solid #e2e8f0', backgroundColor: '#f8fafc', color: '#475569', cursor: 'pointer' }} title="Edit"><Pencil size={11} /></button>
                                        <button onClick={() => { if (window.confirm(`Delete ${s.name}?`)) setSurveyors(surveyors.filter(sv => sv.id !== s.id)); }} style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '5px', border: '1px solid #fca5a5', backgroundColor: '#fef2f2', color: '#dc2626', cursor: 'pointer' }} title="Delete"><Trash2 size={11} /></button>
                                      </div>
                                    </td>
                                  </tr>
                                  {editingSurveyorId === s.id && (
                                    <tr style={{ backgroundColor: '#f0fdf4', borderBottom: '1px solid #e2e8f0' }}>
                                      <td colSpan={8} style={{ padding: '14px 16px' }}>
                                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 2fr 1.5fr auto', gap: '8px', alignItems: 'end' }}>
                                          <input value={editSurveyorName} onChange={e => setEditSurveyorName(e.target.value)} placeholder="Full name" style={{ padding: '7px 9px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px' }} />
                                          <input value={editSurveyorCompany} onChange={e => setEditSurveyorCompany(e.target.value)} placeholder="Company" style={{ padding: '7px 9px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px' }} />
                                          <input value={editSurveyorPhone} onChange={e => setEditSurveyorPhone(e.target.value)} placeholder="Phone" style={{ padding: '7px 9px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px' }} />
                                          <input value={editSurveyorEmail} onChange={e => setEditSurveyorEmail(e.target.value)} placeholder="Email" style={{ padding: '7px 9px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px' }} />
                                          <select value={editSurveyorSpeciality} onChange={e => setEditSurveyorSpeciality(e.target.value)} style={{ padding: '7px 9px', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                                            <option value="Residential">Residential</option><option value="Commercial">Commercial</option><option value="Structural">Structural</option><option value="Building Survey">Building Survey</option>
                                          </select>
                                          <div style={{ display: 'flex', gap: '6px' }}>
                                            <button onClick={() => { setSurveyors(surveyors.map(sv => sv.id === s.id ? { ...sv, name: editSurveyorName, company: editSurveyorCompany, phone: editSurveyorPhone, email: editSurveyorEmail, speciality: editSurveyorSpeciality } : sv)); setEditingSurveyorId(null); }} style={{ padding: '7px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
                                            <button onClick={() => setEditingSurveyorId(null)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancel</button>
                                          </div>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                  {isLogging && (
                                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                      <td colSpan={8} style={{ padding: '14px 16px' }}>
                                        <form onSubmit={(e) => handleLogJob(e, s.id)} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                          <input type="text" placeholder="Property address" value={jobFormAddress} onChange={e => setJobFormAddress(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                                          <input type="number" placeholder="Cost (£)" value={jobFormCost} onChange={e => setJobFormCost(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                                          <input type="number" placeholder="Days" value={jobFormTurnaround} onChange={e => setJobFormTurnaround(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                                          <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                            {[1,2,3,4,5].map(n => <button key={n} type="button" onClick={() => setJobFormRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontSize: '16px', color: jobFormRating >= n ? '#eab308' : '#cbd5e1' }}>★</button>)}
                                          </div>
                                          <div style={{ display: 'flex', gap: '6px' }}>
                                            <button type="submit" style={{ padding: '8px 14px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
                                            <button type="button" onClick={() => setLogJobSurveyorId(null)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancel</button>
                                          </div>
                                        </form>
                                      </td>
                                    </tr>
                                  )}
                                  {isExpanded && s.ratings.length > 0 && (
                                    <tr style={{ backgroundColor: '#fafafa', borderBottom: '1px solid #e2e8f0' }}>
                                      <td colSpan={8} style={{ padding: '12px 16px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                          <thead><tr><th style={{ padding: '4px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: '600' }}>Property</th><th style={{ padding: '4px 8px', color: '#94a3b8', fontWeight: '600' }}>Rating</th><th style={{ padding: '4px 8px', color: '#94a3b8', fontWeight: '600' }}>Cost</th><th style={{ padding: '4px 8px', color: '#94a3b8', fontWeight: '600' }}>Days</th><th style={{ padding: '4px 8px', color: '#94a3b8', fontWeight: '600' }}>Date</th><th style={{ padding: '4px 8px' }}></th></tr></thead>
                                          <tbody>{s.ratings.map((r, i) => <tr key={i}><td style={{ padding: '5px 8px', color: '#0f172a', fontWeight: '500' }}>{r.propertyAddress}</td><td style={{ padding: '5px 8px', color: '#d97706' }}>{'★'.repeat(r.rating)}</td><td style={{ padding: '5px 8px' }}>£{r.cost.toLocaleString()}</td><td style={{ padding: '5px 8px' }}>{r.turnaroundDays}d</td><td style={{ padding: '5px 8px', color: '#94a3b8' }}>{r.date}</td><td style={{ padding: '5px 8px' }}><Trash2 size={11} style={{ color: '#fca5a5', cursor: 'pointer' }} onClick={() => setSurveyors(surveyors.map(sv => sv.id === s.id ? { ...sv, ratings: sv.ratings.filter((_, ri) => ri !== i) } : sv))} /></td></tr>)}</tbody>
                                        </table>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ==================== TAB: AUCTION INTEL (Option A) ==================== */}
              {activeTab === 'auctionintel' && (() => {
                const platforms = [...new Set(properties.map(p => p.sourcePlatform))].filter(Boolean);
                const maxLots = Math.max(...platforms.map(pl => properties.filter(p => p.sourcePlatform === pl).length), 1);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Stat cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {[
                        ['Total lots tracked', properties.length, '#0f172a'],
                        ['Strong bid opportunities', properties.filter(p => p.isStrongBid).length, '#059669'],
                        ['Exchanged', properties.filter(p => p.status === 'Exchanged' || p.status === 'Won').length, '#065f46'],
                        ['Watchlist items', watchlist.length, '#1d4ed8'],
                      ].map(([label, val, color]) => (
                        <div key={label} style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Platform activity bar chart */}
                    {platforms.length > 0 && (
                      <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Lots by platform</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {platforms.map(pl => {
                            const lots = properties.filter(p => p.sourcePlatform === pl);
                            const pct = Math.round((lots.length / maxLots) * 100);
                            const wonC = lots.filter(p => p.status === 'Exchanged' || p.status === 'Won').length;
                            const strongC = lots.filter(p => p.isStrongBid).length;
                            return (
                              <div key={pl} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '140px', fontSize: '12px', fontWeight: '500', color: '#0f172a', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl}</div>
                                <div style={{ flex: 1, height: '20px', backgroundColor: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#059669', borderRadius: '4px', transition: 'width 0.3s', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>
                                    {pct > 15 && <span style={{ fontSize: '10px', fontWeight: '700', color: '#fff' }}>{lots.length}</span>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', fontSize: '10px', color: '#64748b', flexShrink: 0 }}>
                                  {strongC > 0 && <span style={{ color: '#059669', fontWeight: '600' }}>{strongC} strong</span>}
                                  {wonC > 0 && <span style={{ color: '#065f46', fontWeight: '600' }}>{wonC} won</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Watchlist */}
                    <div style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Add to watchlist</div>
                      <form onSubmit={handleAddWatchlistItem} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '3fr 2fr 1fr 1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                        <input type="text" placeholder="Property address" value={newWatchAddress} onChange={e => setNewWatchAddress(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                        <input type="text" placeholder="Auction house" value={newWatchPlatform} onChange={e => setNewWatchPlatform(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                        <input type="number" placeholder="Guide (£)" value={newWatchGuidePrice} onChange={e => setNewWatchGuidePrice(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                        <input type="date" value={newWatchAuctionDate} onChange={e => setNewWatchAuctionDate(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                        <input type="text" placeholder="Notes" value={newWatchNotes} onChange={e => setNewWatchNotes(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                        <button type="submit" style={{ padding: '8px 14px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                      </form>
                    </div>

                    {/* Bidding Performance Analytics */}
                    {(() => {
                      const completed = properties.filter(p => ['Exchanged', 'Outbid', 'No Bid', 'Won'].includes(p.status));
                      if (completed.length === 0) return null;
                      const won = completed.filter(p => p.status === 'Exchanged' || p.status === 'Won');
                      const outbid = completed.filter(p => p.status === 'Outbid');
                      const noBid = completed.filter(p => p.status === 'No Bid');
                      const winRate = Math.round(won.length / completed.length * 100);
                      const byPlatform = {};
                      properties.forEach(p => {
                        if (!p.sourcePlatform) return;
                        if (!byPlatform[p.sourcePlatform]) byPlatform[p.sourcePlatform] = { name: p.sourcePlatform, total: 0, won: 0, outbid: 0, noBid: 0, active: 0 };
                        byPlatform[p.sourcePlatform].total++;
                        if (p.status === 'Exchanged' || p.status === 'Won') byPlatform[p.sourcePlatform].won++;
                        else if (p.status === 'Outbid') byPlatform[p.sourcePlatform].outbid++;
                        else if (p.status === 'No Bid') byPlatform[p.sourcePlatform].noBid++;
                        else byPlatform[p.sourcePlatform].active++;
                      });
                      const platformRows = Object.values(byPlatform).sort((a, b) => b.total - a.total);
                      return (
                        <>
                          <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Bidding performance</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                              {[
                                ['Win rate', `${winRate}%`, winRate >= 30 ? '#059669' : winRate >= 15 ? '#d97706' : '#dc2626'],
                                ['Deals completed', completed.length, '#0f172a'],
                                ['Outbid', outbid.length, '#d97706'],
                                ['No bid', noBid.length, '#64748b'],
                              ].map(([label, val, color]) => (
                                <div key={label} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
                                  <div style={{ fontSize: '22px', fontWeight: '700', color }}>{val}</div>
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {completed.slice(0, 8).map(p => (
                                <div key={p.id} onClick={() => { setCurrentViewProperty(p); setActiveTab('pipeline'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', backgroundColor: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                  <span style={{ flex: 1, fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</span>
                                  {p.sourcePlatform && <span style={{ fontSize: '10px', color: '#94a3b8', flexShrink: 0 }}>{p.sourcePlatform}</span>}
                                  {p.guidePrice > 0 && <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>Guide £{p.guidePrice.toLocaleString()}</span>}
                                  {p.maxBid > 0 && <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>Max £{p.maxBid.toLocaleString()}</span>}
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', flexShrink: 0, backgroundColor: p.status === 'Exchanged' || p.status === 'Won' ? '#dcfce7' : p.status === 'Outbid' ? '#fef3c7' : '#f1f5f9', color: p.status === 'Exchanged' || p.status === 'Won' ? '#166534' : p.status === 'Outbid' ? '#92400e' : '#475569' }}>{p.status}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Guide vs hammer price analysis */}
                          {(() => {
                            const sold = properties.filter(p => (p.status === 'Exchanged' || p.status === 'Won') && p.hammerPrice > 0 && p.guidePrice > 0);
                            if (sold.length === 0) return null;
                            const deltas = sold.map(p => ({ p, pct: (p.hammerPrice - p.guidePrice) / p.guidePrice * 100 }));
                            const overGuide = deltas.filter(d => d.pct > 0);
                            const atOrUnder = deltas.filter(d => d.pct <= 0);
                            const avgOver = deltas.reduce((s, d) => s + d.pct, 0) / deltas.length;
                            const maxOver = Math.max(...deltas.map(d => d.pct));
                            return (
                              <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Guide vs hammer price</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
                                  {[
                                    ['Avg over guide', `${avgOver >= 0 ? '+' : ''}${avgOver.toFixed(1)}%`, avgOver > 15 ? '#dc2626' : avgOver > 0 ? '#d97706' : '#059669'],
                                    ['Sold over guide', `${overGuide.length}/${sold.length}`, '#0f172a'],
                                    ['At/under guide', atOrUnder.length, '#059669'],
                                    ['Biggest over-guide', `+${maxOver.toFixed(0)}%`, '#dc2626'],
                                  ].map(([label, val, color]) => (
                                    <div key={label} style={{ padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #f1f5f9' }}>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
                                      <div style={{ fontSize: '22px', fontWeight: '700', color }}>{val}</div>
                                    </div>
                                  ))}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {deltas.sort((a, b) => b.pct - a.pct).slice(0, 8).map(({ p, pct }) => (
                                    <div key={p.id} onClick={() => { setCurrentViewProperty(p); setActiveTab('pipeline'); }} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px', backgroundColor: '#f8fafc', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>
                                      <span style={{ flex: 1, fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</span>
                                      <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>Guide £{p.guidePrice.toLocaleString()}</span>
                                      <span style={{ fontSize: '11px', color: '#475569', flexShrink: 0 }}>Hammer £{p.hammerPrice.toLocaleString()}</span>
                                      <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', flexShrink: 0, backgroundColor: pct > 0 ? '#fee2e2' : '#dcfce7', color: pct > 0 ? '#991b1b' : '#166534' }}>{pct >= 0 ? '+' : ''}{pct.toFixed(1)}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {platformRows.length > 0 && (
                            <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Auction house performance</div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    {['Auction house', 'Total', 'Won', 'Outbid', 'No bid', 'Active', 'Win rate'].map(h => (
                                      <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Auction house' ? 'left' : 'center', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {platformRows.map(row => {
                                    const completedForRow = row.won + row.outbid + row.noBid;
                                    const wr = completedForRow ? Math.round(row.won / completedForRow * 100) : null;
                                    return (
                                      <tr key={row.name} style={{ borderBottom: '1px solid #f8fafc' }}>
                                        <td style={{ padding: '9px 10px', fontWeight: '600', color: '#0f172a' }}>{row.name}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#475569' }}>{row.total}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#059669', fontWeight: '600' }}>{row.won || '—'}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#d97706' }}>{row.outbid || '—'}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#94a3b8' }}>{row.noBid || '—'}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center', color: '#64748b' }}>{row.active || '—'}</td>
                                        <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                                          {wr !== null ? <span style={{ fontWeight: '700', color: wr >= 30 ? '#059669' : wr >= 15 ? '#d97706' : '#dc2626' }}>{wr}%</span> : <span style={{ color: '#94a3b8' }}>—</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {watchlist.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff' }}>
                        <Bookmark size={24} style={{ marginBottom: '8px', opacity: 0.3 }} />
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>No watchlist items yet</div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>Monitor lots here before adding to the pipeline</div>
                      </div>
                    ) : (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Address</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Auction house</th>
                              <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Guide</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Date</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Notes</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {watchlist.map(item => (
                              <React.Fragment key={item.id}>
                                <tr style={{ borderBottom: editingWatchlistId === item.id ? 'none' : '1px solid #f1f5f9', backgroundColor: editingWatchlistId === item.id ? '#fffbeb' : '#fff' }}>
                                  <td style={{ padding: '11px 14px', fontWeight: '600', color: '#0f172a' }}>{item.address}</td>
                                  <td style={{ padding: '11px 14px', color: '#475569' }}>{item.auctionHouse || '—'}</td>
                                  <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>{item.guidePrice ? `£${item.guidePrice.toLocaleString()}` : '—'}</td>
                                  <td style={{ padding: '11px 14px', textAlign: 'center', color: '#334155' }}>{item.auctionDate || '—'}</td>
                                  <td style={{ padding: '11px 14px', color: '#64748b', fontSize: '11px' }}>{item.notes || '—'}</td>
                                  <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                                      <button onClick={() => handlePromoteWatchlistItem(item)} style={{ padding: '5px 10px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>→ Pipeline</button>
                                      <button onClick={() => { setEditingWatchlistId(editingWatchlistId === item.id ? null : item.id); setEditWatchAddress(item.address); setEditWatchPlatform(item.auctionHouse || ''); setEditWatchGuidePrice(item.guidePrice || ''); setEditWatchDate(item.auctionDate || ''); setEditWatchNotes(item.notes || ''); }} style={{ padding: '5px 8px', backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '5px', cursor: 'pointer' }} title="Edit"><Pencil size={12} /></button>
                                      <button onClick={() => setWatchlist(watchlist.filter(w => w.id !== item.id))} style={{ padding: '5px 8px', backgroundColor: '#fff', color: '#ef4444', border: '1px solid #fca5a5', borderRadius: '5px', cursor: 'pointer' }}><Trash2 size={12} /></button>
                                    </div>
                                  </td>
                                </tr>
                                {editingWatchlistId === item.id && (
                                  <tr style={{ backgroundColor: '#fffbeb', borderBottom: '1px solid #f1f5f9' }}>
                                    <td colSpan={6} style={{ padding: '12px 14px' }}>
                                      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr 1fr 1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                                        <input value={editWatchAddress} onChange={e => setEditWatchAddress(e.target.value)} placeholder="Address" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input value={editWatchPlatform} onChange={e => setEditWatchPlatform(e.target.value)} placeholder="Auction house" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input type="number" value={editWatchGuidePrice} onChange={e => setEditWatchGuidePrice(e.target.value)} placeholder="Guide (£)" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input type="date" value={editWatchDate} onChange={e => setEditWatchDate(e.target.value)} style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input value={editWatchNotes} onChange={e => setEditWatchNotes(e.target.value)} placeholder="Notes" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => { setWatchlist(watchlist.map(w => w.id === item.id ? { ...w, address: editWatchAddress, auctionHouse: editWatchPlatform, platform: editWatchPlatform, guidePrice: parseFloat(editWatchGuidePrice) || 0, auctionDate: editWatchDate, notes: editWatchNotes } : w)); setEditingWatchlistId(null); }} style={{ padding: '7px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
                                          <button onClick={() => setEditingWatchlistId(null)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff', cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: COMPANIES (Option C) ==================== */}
              {activeTab === 'companies' && (() => {
                const linkedContacts = currentViewCompany ? contacts.filter(c => c.companyId === currentViewCompany.id) : [];
                const linkedProps = currentViewCompany ? properties.filter(p => p.sourcePlatform === currentViewCompany.name) : [];
                const typeColour = (t) => ({ 'Auction House': { bg: '#dcfce7', color: '#166534' }, 'Solicitor': { bg: '#eff6ff', color: '#1d4ed8' }, 'Surveyor': { bg: '#fff7ed', color: '#c2410c' }, 'Builder': { bg: '#f5f3ff', color: '#6d28d9' }, 'Estate Agent': { bg: '#f0f9ff', color: '#0369a1' } }[t] || { bg: '#f1f5f9', color: '#475569' });
                return (
                  <div style={{ display: 'flex', gap: '0', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, flex: '1 1 0', overflow: 'hidden', backgroundColor: '#ffffff', borderRadius: isMobile ? '8px' : '12px', border: '1px solid #e2e8f0' }}>
                    {/* Left list */}
                    <div style={{ width: isMobile ? '100%' : '260px', maxHeight: isMobile ? (currentViewCompany ? '0' : '100%') : 'none', overflow: isMobile ? 'hidden' : 'visible', display: isMobile && currentViewCompany ? 'none' : 'flex', borderRight: isMobile ? 'none' : '1px solid #e2e8f0', borderBottom: isMobile ? '1px solid #e2e8f0' : 'none', flexDirection: 'column', flexShrink: 0 }}>
                      <div style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ position: 'relative', marginBottom: '8px' }}>
                          <Search size={13} style={{ position: 'absolute', top: '9px', left: '9px', color: '#94a3b8' }} />
                          <input placeholder="Search companies..." value={companySearchQuery} onChange={e => setCompanySearchQuery(e.target.value)} style={{ width: '100%', padding: '7px 7px 7px 28px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
                        </div>
                        <select value={companySearchType} onChange={e => setCompanySearchType(e.target.value)} style={{ width: '100%', padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                          <option value="ALL">All types</option>
                          <option value="Auction House">Auction House</option>
                          <option value="Solicitor">Solicitor</option>
                          <option value="Surveyor">Surveyor</option>
                          <option value="Builder">Builder</option>
                          <option value="Estate Agent">Estate Agent</option>
                          <option value="Mortgage Broker">Mortgage Broker</option>
                          <option value="Letting Agent">Letting Agent</option>
                          <option value="Architect">Architect</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredCompanies.map(c => {
                          const tc = typeColour(c.type);
                          return (
                            <div key={c.id} onClick={() => { setCurrentViewCompany(c); setCompanyDetailTab('overview'); }} style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: currentViewCompany?.id === c.id ? '#f0fdf4' : '#ffffff', borderLeft: currentViewCompany?.id === c.id ? '3px solid #059669' : '3px solid transparent' }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{c.name}</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                                <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: tc.bg, color: tc.color, fontWeight: '600' }}>{c.type}</span>
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{contacts.filter(con => con.companyId === c.id).length} contacts</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ padding: '10px', borderTop: '1px solid #e2e8f0' }}>
                        <button onClick={() => setCurrentViewCompany({ _new: true })} style={{ width: '100%', padding: '8px', border: '1px dashed #e2e8f0', borderRadius: '6px', backgroundColor: '#f8fafc', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>+ New company</button>
                      </div>
                    </div>

                    {/* Right detail / empty / add form */}
                    {!currentViewCompany ? (
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '8px', color: '#94a3b8' }}>
                        <Briefcase size={32} style={{ opacity: 0.3 }} />
                        <div style={{ fontSize: '14px', fontWeight: '500' }}>Select a company</div>
                        <div style={{ fontSize: '12px' }}>or click + New company below the list</div>
                      </div>
                    ) : currentViewCompany._new ? (
                      <div style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
                        <div style={{ fontSize: '15px', fontWeight: '600', marginBottom: '20px', color: '#0f172a' }}>New company</div>
                        <form onSubmit={(e) => { e.preventDefault(); handleAddCompany(e); setCurrentViewCompany(null); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px' }}>
                          {[['Name *', newCompName, setNewCompName, 'text', 'Company name'],['Website', newCompWeb, setNewCompWeb, 'text', 'Website URL'],['Phone', newCompPhone, setNewCompPhone, 'text', '01234 567890'],['City', newCompCity, setNewCompCity, 'text', 'City']].map(([label, val, setter, type, ph]) => (
                            <div key={label}><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>{label}</label><input type={type} placeholder={ph} value={val} onChange={e => setter(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                          ))}
                          <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Type</label>
                            <select value={newCompType} onChange={e => setNewCompType(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}>
                              <option value="Auction House">Auction House</option>
                              <option value="Solicitor">Solicitor</option>
                              <option value="Surveyor">Surveyor</option>
                              <option value="Builder">Builder</option>
                              <option value="Estate Agent">Estate Agent</option>
                              <option value="Mortgage Broker">Mortgage Broker</option>
                              <option value="Letting Agent">Letting Agent</option>
                              <option value="Architect">Architect</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          {newCompType === 'Auction House' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Buyer's premium</label><input placeholder="e.g. 4% + VAT" value={newCompPremium} onChange={e => setNewCompPremium(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                              <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Admin fee</label><input placeholder="e.g. £1,500 + VAT" value={newCompAdminFee} onChange={e => setNewCompAdminFee(e.target.value)} style={{ width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                            <button type="submit" style={{ padding: '10px 20px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Create company</button>
                            <button type="button" onClick={() => setCurrentViewCompany(null)} style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                          </div>
                        </form>
                      </div>
                    ) : (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {/* Company header */}
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
                          <button onClick={() => setCurrentViewCompany(null)} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#64748b', padding: '0 0 10px 0', fontFamily: 'inherit' }}>
                            <ArrowLeft size={13} /> All companies
                          </button>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: typeColour(currentViewCompany.type).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: '700', color: typeColour(currentViewCompany.type).color, flexShrink: 0 }}>{currentViewCompany.name[0]}</div>
                              <div>
                                <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>{currentViewCompany.name}</div>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '2px' }}>
                                  <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: typeColour(currentViewCompany.type).bg, color: typeColour(currentViewCompany.type).color, fontWeight: '600' }}>{currentViewCompany.type}</span>
                                  {currentViewCompany.phone && <span style={{ fontSize: '11px', color: '#64748b' }}>{currentViewCompany.phone}</span>}
                                  {currentViewCompany.website && currentViewCompany.website !== '--' && <a href={`https://${currentViewCompany.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: '#0369a1', textDecoration: 'none' }}>{currentViewCompany.website}</a>}
                                </div>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => { if(window.confirm(`Delete ${currentViewCompany.name}?`)) { setCompanies(companies.filter(c => c.id !== currentViewCompany.id)); setCurrentViewCompany(null); }}} style={{ padding: '6px 12px', border: '1px solid #fca5a5', borderRadius: '6px', backgroundColor: '#fef2f2', fontSize: '12px', color: '#dc2626', cursor: 'pointer' }}>Delete</button>
                            </div>
                          </div>
                          {/* Tabs */}
                          <div style={{ display: 'flex', gap: '16px', marginTop: '14px' }}>
                            {['overview','contacts','properties','costs'].map(tab => (
                              <button key={tab} onClick={() => setCompanyDetailTab(tab)} style={{ padding: '5px 0', fontSize: '12px', fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer', color: companyDetailTab === tab ? '#059669' : '#94a3b8', borderBottom: companyDetailTab === tab ? '2px solid #059669' : '2px solid transparent', textTransform: 'capitalize' }}>{tab}{tab === 'contacts' ? ` (${linkedContacts.length})` : tab === 'properties' ? ` (${linkedProps.length})` : ''}</button>
                            ))}
                          </div>
                        </div>
                        {/* Tab content */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f8fafc' }}>
                          {companyDetailTab === 'overview' && (() => {
                            const Field = ({ label, field, type = 'text', placeholder = '' }) => (
                              <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>{label}</label>
                                <input type={type} value={currentViewCompany[field] || ''} onChange={e => updateCompanyField(field, e.target.value)} placeholder={placeholder || label} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
                              </div>
                            );
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                              {settingsIntegrations.companiesHouse && (
                                <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                                  <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '12px' }}>Search Companies House</div>
                                  <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                    <input type="text" value={chQuery} onChange={e => setChQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchCompaniesHouse(); } }} placeholder="Company name or number…" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                                    <button onClick={searchCompaniesHouse} style={{ padding: '8px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>{chLoading ? '…' : 'Search'}</button>
                                  </div>
                                  {chResults !== null && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      {chResults.length === 0 ? <div style={{ fontSize: '12px', color: '#94a3b8' }}>No results found.</div> : chResults.map(item => (
                                        <div key={item.company_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                          <div>
                                            <div style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>{item.title}</div>
                                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{item.company_number} · {item.company_status} · {item.address_snippet}</div>
                                          </div>
                                          <button onClick={() => { updateCompanyField('name', item.title); updateCompanyField('address', item.address?.address_line_1 || item.address_snippet || ''); updateCompanyField('city', item.address?.locality || ''); setChResults(null); setChQuery(''); }} style={{ padding: '5px 10px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '10px' }}>Import</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                              {(() => {
                                const TYPE_FIELDS = {
                                  'Auction House':   { title: 'Auction fees & structure', fields: [{ l: "Buyer's premium", f: 'buyersPremium', ph: "e.g. 4% + VAT" }, { l: 'Admin fee', f: 'adminFee', ph: "e.g. £1,500 + VAT" }, { l: 'Deposit required', f: 'depositPct', ph: "e.g. 10%" }, { l: 'Auction format', f: 'auctionType', ph: "Room / Online / Timed / Hybrid" }, { l: 'Catalogue URL', f: 'catalogueUrl', ph: "e.g. allsop.co.uk/catalogue" }] },
                                  'Solicitor':       { title: 'Legal & conveyancing', fields: [{ l: 'Conveyancing fee', f: 'conveyancingFee', ph: "e.g. £1,200 + VAT" }, { l: 'Avg. completion (weeks)', f: 'avgCompletionWeeks', ph: "e.g. 8–12 weeks" }, { l: 'Specialisms', f: 'specialisms', ph: "e.g. residential, lease extension" }, { l: 'Regulated by', f: 'regulatedBy', ph: "e.g. SRA, CILEx" }] },
                                  'Surveyor':        { title: 'Survey services', fields: [{ l: 'Survey types offered', f: 'surveyTypes', ph: "e.g. RICS Level 2, Full Structural" }, { l: 'Typical turnaround (days)', f: 'turnaroundDays', ph: "e.g. 5–7 working days" }, { l: 'Fee range', f: 'feeRange', ph: "e.g. £350–£750" }, { l: 'RICS number', f: 'ricsNumber', ph: "e.g. 01234567" }] },
                                  'Builder':         { title: 'Trade & contractor', fields: [{ l: 'Specialisms / trades', f: 'tradeSpecialisms', ph: "e.g. roofing, electrical, general build" }, { l: 'Day rate', f: 'dayRate', ph: "e.g. £250/day" }, { l: 'Typical lead time', f: 'leadTime', ph: "e.g. 2–3 weeks" }, { l: 'Labour type', f: 'labourType', ph: "Supply & fit / Labour only" }] },
                                  'Estate Agent':    { title: 'Agency fees & coverage', fields: [{ l: 'Sales fee', f: 'salesFee', ph: "e.g. 1.5% + VAT" }, { l: 'Lettings management fee', f: 'managementFee', ph: "e.g. 10% + VAT" }, { l: 'Areas covered', f: 'areasCovered', ph: "e.g. Sheffield S1–S10" }, { l: 'Specialisms', f: 'specialisms', ph: "e.g. HMO, residential, commercial" }] },
                                  'Mortgage Broker': { title: 'Mortgage & finance', fields: [{ l: 'Market access', f: 'marketAccess', ph: "Whole of market / Tied" }, { l: 'Broker fee', f: 'brokerFee', ph: "e.g. £499 or 0.5% of loan" }, { l: 'Specialisms', f: 'specialisms', ph: "e.g. BTL, bridging, development" }, { l: 'Max LTV covered', f: 'maxLtv', ph: "e.g. 85% LTV" }] },
                                  'Letting Agent':   { title: 'Letting fees & services', fields: [{ l: 'Management fee', f: 'managementFee', ph: "e.g. 10% + VAT" }, { l: 'Tenant find fee', f: 'tenantFindFee', ph: "e.g. £500 + VAT" }, { l: 'Areas covered', f: 'areasCovered', ph: "e.g. Sheffield S1–S10" }, { l: 'HMO licensed', f: 'hmoLicensed', ph: "Yes / No" }] },
                                  'Architect':       { title: 'Design & planning', fields: [{ l: 'Fee structure', f: 'feeStructure', ph: "e.g. 8–12% of build / fixed fee" }, { l: 'Specialisms', f: 'specialisms', ph: "e.g. conversion, new build, heritage" }, { l: 'RIBA member', f: 'ribaMember', ph: "Yes / No + member no." }, { l: 'Planning success rate', f: 'planningSuccessRate', ph: "e.g. 95%" }] },
                                  'Other':           { title: 'Service details', fields: [{ l: 'Service offered', f: 'serviceOffered', ph: "e.g. block manager, financial advisor" }, { l: 'Fee / rate', f: 'feeRate', ph: "e.g. £150/hr or fixed fee" }] },
                                };
                                const typeFields = TYPE_FIELDS[currentViewCompany.type] || TYPE_FIELDS['Other'];
                                return (
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '14px' }}>Company details</div>
                                      <Field label="Company name" field="name" placeholder="e.g. Allsop LLP" />
                                      <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Type</label>
                                        <select value={currentViewCompany.type || ''} onChange={e => updateCompanyField('type', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}>
                                          {['Auction House','Solicitor','Surveyor','Builder','Estate Agent','Mortgage Broker','Letting Agent','Architect','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                      </div>
                                      <Field label="Phone" field="phone" type="tel" placeholder="e.g. 0114 276 0151" />
                                      <Field label="Website" field="website" placeholder="e.g. www.allsop.co.uk" />
                                      <Field label="City / Location" field="city" placeholder="e.g. Sheffield" />
                                      <Field label="Address" field="address" placeholder="Street address" />
                                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Opens</label>
                                          <input type="time" value={currentViewCompany.opensAt || ''} onChange={e => updateCompanyField('opensAt', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
                                        </div>
                                        <div>
                                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Closes</label>
                                          <input type="time" value={currentViewCompany.closesAt || ''} onChange={e => updateCompanyField('closesAt', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
                                        </div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '14px' }}>{typeFields.title}</div>
                                        {typeFields.fields.map(({ l, f, ph }) => (
                                          <div key={f} style={{ marginBottom: '14px' }}>
                                            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>{l}</label>
                                            <input value={currentViewCompany[f] || ''} onChange={e => updateCompanyField(f, e.target.value)} placeholder={ph} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
                                          </div>
                                        ))}
                                      </div>
                                      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '14px' }}>Notes</div>
                                        <textarea value={currentViewCompany.notes || ''} onChange={e => updateCompanyField('notes', e.target.value)} placeholder="Any notes about this company…" rows={4} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical' }} />
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              </div>
                            );
                          })()}
                          {companyDetailTab === 'contacts' && (
                            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                              {linkedContacts.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts linked to this company</div> : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                  <thead><tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Name</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Job Title</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Email</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Phone</th></tr></thead>
                                  <tbody>{linkedContacts.map(c => <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '10px 14px', fontWeight: '600', color: '#0f172a' }}>{c.name}</td><td style={{ padding: '10px 14px', color: '#64748b' }}>{c.jobTitle}</td><td style={{ padding: '10px 14px', color: '#475569' }}>{c.email}</td><td style={{ padding: '10px 14px', color: '#475569' }}>{c.phone !== '--' ? c.phone : '—'}</td></tr>)}</tbody>
                                </table>
                              )}
                            </div>
                          )}
                          {companyDetailTab === 'properties' && (
                            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                              {linkedProps.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No pipeline properties linked to this platform</div> : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                  <thead><tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Address</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Status</th><th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Guide</th><th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Auction date</th></tr></thead>
                                  <tbody>{linkedProps.map(p => <tr key={p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); }} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}><td style={{ padding: '10px 14px', fontWeight: '600', color: '#0284c7' }}>{p.address}</td><td style={{ padding: '10px 14px' }}><span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600', backgroundColor: getStatusStyle(p.status || 'Sourced').bg, color: getStatusStyle(p.status || 'Sourced').color }}>{p.status || 'Sourced'}</span></td><td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600' }}>£{p.guidePrice?.toLocaleString()}</td><td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>{p.auctionDate}</td></tr>)}</tbody>
                                </table>
                              )}
                            </div>
                          )}
                          {companyDetailTab === 'costs' && (
                            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px', maxWidth: '480px' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Auction fees & costs</div>
                              {[["Buyer's premium", 'buyersPremium', "e.g. 4% + VAT"], ['Admin fee', 'adminFee', "e.g. £1,500 + VAT"], ['Legal fee', 'legalFee', "e.g. £750 + VAT"], ['Survey fee', 'surveyFee', "e.g. £350"]].map(([label, field, ph]) => (
                                <div key={field} style={{ marginBottom: '12px' }}>
                                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '4px' }}>{label}</label>
                                  <input value={currentViewCompany[field] || ''} onChange={e => updateCompanyField(field, e.target.value)} placeholder={ph} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: CONTACTS (Option A) ==================== */}
              {activeTab === 'contacts' && (
                <div style={{ display: 'flex', gap: '0', minHeight: 0, flex: '1 1 0', overflow: 'hidden', backgroundColor: '#ffffff', borderRadius: isMobile ? '8px' : '12px', border: '1px solid #e2e8f0' }}>
                  {/* Left: table + search */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Toolbar */}
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={13} style={{ position: 'absolute', top: '9px', left: '9px', color: '#94a3b8' }} />
                        <input placeholder="Search contacts..." value={contactSearchQuery} onChange={e => setContactSearchQuery(e.target.value)} style={{ width: '100%', padding: '7px 7px 7px 28px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
                      </div>
                      <button onClick={() => setCurrentViewContact({ _new: true })} style={{ padding: '7px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ New contact</button>
                    </div>
                    {/* Table */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                      {isMobile ? (
                        <div style={{ padding: '8px' }}>
                          {filteredContacts.map(con => {
                            const linkedCo = companies.find(c => c.id === con.companyId);
                            const initials = con.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
                            return (
                              <div key={con.id} onClick={() => setCurrentViewContact(con)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '8px', background: '#fff', cursor: 'pointer' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#0369a1', flexShrink: 0 }}>{initials}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontWeight: '600', color: '#0f172a', fontSize: '13px', marginBottom: '2px' }}>{con.name}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{con.jobTitle && con.jobTitle !== '--' ? con.jobTitle : ''}{linkedCo ? ` · ${linkedCo.name}` : ''}</div>
                                  {con.email && <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>{con.email}</div>}
                                </div>
                                {con.role && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f8fafc', color: '#475569', fontWeight: '600', flexShrink: 0 }}>{con.role}</span>}
                              </div>
                            );
                          })}
                          {filteredContacts.length === 0 && <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts yet</div>}
                        </div>
                      ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                          <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Name</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Job Title</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Company</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Role</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Email</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Phone</th>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Last activity</th>
                            <th style={{ padding: '10px 14px' }}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredContacts.map(con => {
                            const linkedCo = companies.find(c => c.id === con.companyId);
                            const initials = con.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase();
                            return (
                              <tr key={con.id} onClick={() => setCurrentViewContact(con)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', backgroundColor: currentViewContact?.id === con.id ? '#f0fdf4' : '#ffffff' }}>
                                <td style={{ padding: '11px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#0369a1', flexShrink: 0 }}>{initials}</div>
                                    <span style={{ fontWeight: '600', color: '#0f172a' }}>{con.name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '11px 14px', color: '#475569' }}>{con.jobTitle !== '--' ? con.jobTitle : '—'}</td>
                                <td style={{ padding: '11px 14px' }}>{linkedCo ? <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: '#f0fdf4', color: '#065f46', fontWeight: '500' }}>{linkedCo.name}</span> : <span style={{ color: '#94a3b8' }}>—</span>}</td>
                                <td style={{ padding: '11px 14px' }}>{con.role ? <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: con.role === 'Surveyor' ? '#eff6ff' : con.role === 'Agent' ? '#f0fdf4' : con.role === 'Solicitor' ? '#fdf4ff' : '#f8fafc', color: con.role === 'Surveyor' ? '#1d4ed8' : con.role === 'Agent' ? '#166534' : con.role === 'Solicitor' ? '#7c3aed' : '#475569', fontWeight: '600' }}>{con.role}</span> : <span style={{ color: '#94a3b8', fontSize: '11px' }}>—</span>}</td>
                                <td style={{ padding: '11px 14px', color: '#475569', fontSize: '11px' }}>{con.email || '—'}</td>
                                <td style={{ padding: '11px 14px', color: con.phone !== '--' ? '#047857' : '#94a3b8', fontSize: '11px' }}>{con.phone !== '--' ? con.phone : '—'}</td>
                                <td style={{ padding: '11px 14px', color: '#94a3b8', fontSize: '11px' }}>{con.lastActivity}</td>
                                <td style={{ padding: '11px 14px' }} onClick={e => { e.stopPropagation(); if(window.confirm(`Delete ${con.name}?`)) setContacts(contacts.filter(c => c.id !== con.id)); }}><Trash2 size={13} style={{ color: '#fca5a5', cursor: 'pointer' }} /></td>
                              </tr>
                            );
                          })}
                          {filteredContacts.length === 0 && <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts yet — click + New contact to add one</td></tr>}
                        </tbody>
                      </table>
                      )}
                    </div>
                  </div>

                  {/* Right panel — fully editable */}
                  {currentViewContact && !currentViewContact._new && (
                    <div style={{ width: isMobile ? '100%' : '320px', borderLeft: isMobile ? 'none' : '1px solid #e2e8f0', borderTop: isMobile ? '1px solid #e2e8f0' : 'none', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
                      {/* Header */}
                      <div style={{ padding: '14px 16px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: '#0369a1', flexShrink: 0 }}>{currentViewContact.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()}</div>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{currentViewContact.name}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{currentViewContact.jobTitle || 'No title'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={() => { if(window.confirm(`Delete ${currentViewContact.name}?`)) { setContacts(contacts.filter(c => c.id !== currentViewContact.id)); setCurrentViewContact(null); }}} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px' }}><Trash2 size={13} /></button>
                          <button onClick={() => setCurrentViewContact(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}><X size={14} /></button>
                        </div>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {/* Editable fields */}
                        {[
                          ['Full name', 'name', 'text', 'Full name'],
                          ['Job title', 'jobTitle', 'text', 'e.g. Director'],
                          ['Email', 'email', 'email', 'Email address'],
                          ['Mobile', 'phone', 'tel', 'Mobile number'],
                          ['Office phone', 'officePhone', 'tel', 'Office / landline'],
                          ['LinkedIn', 'linkedin', 'url', 'linkedin.com/in/...'],
                        ].map(([label, field, type, ph]) => (
                          <div key={field}>
                            <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{label}</label>
                            <input type={type} value={currentViewContact[field] || ''} onChange={e => updateContactField(field, e.target.value)} placeholder={ph} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                          </div>
                        ))}
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>Company</label>
                          <select value={currentViewContact.companyId || ''} onChange={e => updateContactField('companyId', parseInt(e.target.value) || null)} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="">None</option>
                            {companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>Role</label>
                          <select value={currentViewContact.role || ''} onChange={e => updateContactField('role', e.target.value)} style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="">Select role…</option>
                            <option value="Surveyor">Surveyor</option>
                            <option value="Agent">Agent</option>
                            <option value="Solicitor">Solicitor</option>
                            <option value="Broker">Broker</option>
                            <option value="Contractor">Contractor</option>
                            <option value="Investor">Investor</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>How we met</label>
                          <input value={currentViewContact.origin || ''} onChange={e => updateContactField('origin', e.target.value)} placeholder="e.g. Auction, Referral, LinkedIn" style={{ width: '100%', padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>

                        {/* Notes */}
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>Activity notes</div>
                          {globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === currentViewContact.id).map(n => (
                            <div key={n.id} style={{ padding: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', marginBottom: '6px', fontSize: '12px', color: '#0f172a' }}>
                              {n.text}
                              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '3px' }}>{n.author} · {n.date} · {n.type}</div>
                            </div>
                          ))}
                          {globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === currentViewContact.id).length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8' }}>No notes yet</div>}
                          <form onSubmit={e => handleAddUnifiedNote(e, 'Contact', currentViewContact.id)} style={{ marginTop: '8px' }}>
                            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note…" rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                              <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                                <option value="Call">📞 Call</option><option value="Meeting">🤝 Meeting</option><option value="Email">✉️ Email</option><option value="Review">📋 Review</option>
                              </select>
                              <button type="submit" style={{ padding: '6px 12px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Add</button>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* New contact form panel */}
                  {currentViewContact?._new && (
                    <div style={{ width: '300px', borderLeft: '1px solid #e2e8f0', padding: '20px', overflowY: 'auto', flexShrink: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>New contact</div>
                      <form onSubmit={(e) => { handleAddContact(e); setCurrentViewContact(null); }} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {[['Name *', newConName, setNewConName, 'text', 'Full name'], ['Email', newConEmail, setNewConEmail, 'email', 'Email address'], ['Mobile', newConPhone, setNewConPhone, 'tel', 'Mobile number'], ['Job title', newConTitle, setNewConTitle, 'text', 'e.g. Director']].map(([label, val, setter, type, ph]) => (
                          <div key={label}><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '3px' }}>{label}</label><input type={type} placeholder={ph} value={val} onChange={e => setter(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} /></div>
                        ))}
                        <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '3px' }}>Company</label>
                          <select value={newConCompanyId} onChange={e => setNewConCompanyId(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="">None</option>{companies.map(c => <option key={c.id} value={c.id}>{c.name} ({c.type})</option>)}
                          </select>
                        </div>
                        <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '3px' }}>Role</label>
                          <select value={newConRole} onChange={e => setNewConRole(e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="">Select role…</option>
                            <option value="Surveyor">Surveyor</option>
                            <option value="Agent">Agent</option>
                            <option value="Solicitor">Solicitor</option>
                            <option value="Broker">Broker</option>
                            <option value="Contractor">Contractor</option>
                            <option value="Investor">Investor</option>
                            <option value="Other">Other</option>
                          </select>
                        </div>
                        <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '3px' }}>How we met</label>
                          <input value={newConOrigin} onChange={e => setNewConOrigin(e.target.value)} placeholder="e.g. Auction, Referral, LinkedIn" style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button type="submit" style={{ flex: 1, padding: '9px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Create</button>
                          <button type="button" onClick={() => setCurrentViewContact(null)} style={{ flex: 1, padding: '9px', backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}


              {/* ==================== TAB: DEAL ANALYSIS ==================== */}
              {activeTab === 'dealanalysis' && (() => {
                const dealsWithReports = properties.filter(p => p.analytics && Object.keys(p.analytics).length > 5);
                const activeDeal = dealsWithReports.find(p => p.id === selectedAnalysisDealId) || dealsWithReports[0];
                const an = activeDeal?.analytics;
                const fmt = (v) => v != null ? `£${Number(v).toLocaleString()}` : '—';
                const curMatrix = an?.[matrixGdvTab === 'conservative' ? 'matrixConservative' : matrixGdvTab === 'optimistic' ? 'matrixOptimistic' : 'matrixBase'] || [];
                const cellStyle = (margin) => {
                  if (margin >= 15) return { bg: '#EAF3DE', col: '#3B6D11' };
                  if (margin >= 5)  return { bg: '#FAEEDA', col: '#854F0B' };
                  return { bg: '#FCEBEB', col: '#A32D2D' };
                };
                const totalProfit = dealsWithReports.reduce((s, p) => s + (p.analytics?.netProfit || 0), 0);
                const avgRoi = dealsWithReports.length ? (dealsWithReports.reduce((s, p) => s + (p.analytics?.roi || 0), 0) / dealsWithReports.length).toFixed(1) : 0;
                const strongCount = dealsWithReports.filter(p => p.analytics?.bidStrength === 'Strong').length;
                const verdictBg = (bs) => bs === 'Strong' ? '#EAF3DE' : bs === 'Avoid' ? '#FCEBEB' : '#FAEEDA';
                const verdictCol = (bs) => bs === 'Strong' ? '#3B6D11' : bs === 'Avoid' ? '#A32D2D' : '#854F0B';
                const verdictBorder = (bs) => bs === 'Strong' ? '#97C459' : bs === 'Avoid' ? '#F09595' : '#FAC775';
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Summary row */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                      {[
                        { label: 'Reports uploaded', value: dealsWithReports.length, sub: 'deal analyses parsed' },
                        { label: 'Total potential profit', value: totalProfit ? fmt(totalProfit) : '—', sub: 'at target bid across all deals' },
                        { label: 'Average ROI', value: `${avgRoi}%`, sub: 'across analysed deals' },
                        { label: 'Strong bids', value: `${strongCount} / ${dealsWithReports.length}`, sub: 'ready to bid' },
                      ].map(({ label, value, sub }) => (
                        <div key={label} style={{ backgroundColor: '#ffffff', padding: '16px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '6px' }}>{label}</div>
                          <div style={{ fontSize: '22px', fontWeight: '600', color: '#0f172a' }}>{value}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>
                        </div>
                      ))}
                    </div>

                    {dealsWithReports.length === 0 ? (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '60px 40px', textAlign: 'center' }}>
                        <div style={{ fontSize: '40px', marginBottom: '16px' }}>📊</div>
                        <div style={{ fontSize: '18px', fontWeight: '600', color: '#0f172a', marginBottom: '8px' }}>No deal reports yet</div>
                        <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px', maxWidth: '420px', margin: '0 auto 24px' }}>Upload your Primary Assessment Report HTML file to a property in the pipeline. The full scenario matrix, cost stack, and bid strategy will appear here automatically.</div>
                        <button onClick={() => setActiveTab('pipeline')} style={{ padding: '10px 24px', backgroundColor: '#7C3AED', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Go to Pipeline →</button>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: '14px', alignItems: 'start' }}>
                        {/* Left: deal list */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {/* Compare toggle */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em' }}>Deals</span>
                            <button
                              onClick={() => { setCompareMode(!compareMode); setCompareIds([]); }}
                              style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', border: `1px solid ${compareMode ? '#7C3AED' : '#e2e8f0'}`, background: compareMode ? '#F5F3FF' : '#fff', color: compareMode ? '#7C3AED' : '#64748b', cursor: 'pointer', fontWeight: compareMode ? '600' : '400' }}
                            >
                              {compareMode ? '✕ Exit compare' : '⇄ Compare'}
                            </button>
                          </div>
                          {compareMode && (
                            <div style={{ fontSize: '11px', color: '#7C3AED', backgroundColor: '#F5F3FF', padding: '7px 10px', borderRadius: '6px', border: '1px solid #DDD6FE' }}>
                              Select up to 3 deals to compare side by side
                            </div>
                          )}
                          {dealsWithReports.map(p => {
                            const isActive = !compareMode && activeDeal?.id === p.id;
                            const compareIdx = compareIds.indexOf(p.id);
                            const isSelected = compareIdx !== -1;
                            const bs = p.analytics?.bidStrength || 'Conditional';
                            const handleClick = () => {
                              if (compareMode) {
                                if (isSelected) {
                                  setCompareIds(compareIds.filter(id => id !== p.id));
                                } else if (compareIds.length < 3) {
                                  setCompareIds([...compareIds, p.id]);
                                }
                              } else {
                                setSelectedAnalysisDealId(p.id);
                              }
                            };
                            return (
                              <div key={p.id} onClick={handleClick} style={{ border: isSelected ? '1.5px solid #7C3AED' : isActive ? '1.5px solid #7C3AED' : '0.5px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', cursor: 'pointer', backgroundColor: isSelected ? '#F5F3FF' : isActive ? '#F5F3FF' : '#ffffff', position: 'relative' }}>
                                {compareMode && (
                                  <div style={{ position: 'absolute', top: '8px', right: '8px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: isSelected ? '#7C3AED' : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: isSelected ? '#fff' : '#94a3b8' }}>
                                    {isSelected ? compareIdx + 1 : ''}
                                  </div>
                                )}
                                <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: compareMode ? '24px' : '0' }}>{p.dealName || p.address.split(',')[0]}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address}</div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '20px', backgroundColor: verdictBg(bs), color: verdictCol(bs), fontWeight: '500' }}>{bs}</span>
                                  {p.analytics?.maxBid && <span style={{ fontSize: '11px', color: '#64748b' }}>Max <strong style={{ color: '#0f172a' }}>{fmt(p.analytics.maxBid)}</strong></span>}
                                  {p.analytics?.roi != null && <span style={{ fontSize: '11px', color: '#64748b' }}>ROI <strong style={{ color: '#059669' }}>{p.analytics.roi}%</strong></span>}
                                </div>
                              </div>
                            );
                          })}
                          <button onClick={() => setActiveTab('pipeline')} style={{ width: '100%', padding: '8px', fontSize: '12px', border: '0.5px dashed #cbd5e1', borderRadius: '8px', background: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '2px' }}>
                            + Upload via pipeline
                          </button>
                        </div>

                        {/* Right: compare view */}
                        {compareMode && (() => {
                          const compareDeals = compareIds.map(id => dealsWithReports.find(p => p.id === id)).filter(Boolean);
                          const getBest = (vals, higher) => {
                            const nums = vals.map(v => Number(v)).filter(n => !isNaN(n));
                            return nums.length ? (higher ? Math.max(...nums) : Math.min(...nums)) : null;
                          };
                          const metricRows = [
                            { label: 'Bid verdict', key: 'bidStrength', renderVal: (v) => v ? <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', backgroundColor: verdictBg(v), color: verdictCol(v) }}>{v}</span> : '—' },
                            { label: 'Guide price', key: 'guidePrice', renderVal: (v) => fmt(v) },
                            { label: 'Target bid', key: 'targetBid', renderVal: (v) => fmt(v), higher: false },
                            { label: 'Walk away', key: 'walkAway', renderVal: (v) => fmt(v), higher: false },
                            { label: 'Net profit', key: 'netProfit', renderVal: (v) => fmt(v), higher: true },
                            { label: 'Margin', key: 'margin', renderVal: (v) => v != null ? `${v}%` : '—', higher: true },
                            { label: 'ROI', key: 'roi', renderVal: (v) => v != null ? `${v}%` : '—', higher: true },
                            { label: 'Total investment', key: 'totalInvestment', renderVal: (v) => fmt(v), higher: false },
                            { label: 'GDV (base)', key: 'gdvBase', renderVal: (v) => fmt(v), higher: true },
                            { label: 'Refurb (medium)', key: 'refurbMedium', renderVal: (v) => fmt(v), higher: false },
                            { label: 'Break-even bid', key: 'breakEvenBid', renderVal: (v) => fmt(v), higher: false },
                          ];
                          const numCols = compareDeals.length;
                          const colTemplate = `140px repeat(${numCols || 1}, 1fr)`;
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {/* Slot cards — compact */}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                                {[0, 1, 2].map(si => {
                                  const d = compareDeals[si];
                                  const bs = d?.analytics?.bidStrength;
                                  return d ? (
                                    <div key={si} style={{ border: '1.5px solid #7C3AED', borderRadius: '8px', padding: '8px 10px', backgroundColor: '#F5F3FF', display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#7C3AED', color: '#fff', fontSize: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{si + 1}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dealName || d.address.split(',')[0]}</div>
                                        <div style={{ fontSize: '10px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.address}</div>
                                      </div>
                                      {bs && <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '20px', backgroundColor: verdictBg(bs), color: verdictCol(bs), fontWeight: '600', flexShrink: 0 }}>{bs}</span>}
                                      <button onClick={() => setCompareIds(compareIds.filter(id => id !== d.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0', flexShrink: 0, lineHeight: 1, fontSize: '14px' }}>×</button>
                                    </div>
                                  ) : (
                                    <div key={si} style={{ border: '1.5px dashed #e2e8f0', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '12px' }}>
                                      <span style={{ width: '18px', height: '18px', borderRadius: '50%', border: '1.5px dashed #cbd5e1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#cbd5e1', flexShrink: 0 }}>{si + 1}</span>
                                      <span style={{ fontSize: '11px' }}>Pick from list</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Comparison table */}
                              {compareDeals.length < 2 ? (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '40px', textAlign: 'center' }}>
                                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>Select at least 2 deals from the list on the left to compare</div>
                                </div>
                              ) : (
                                <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                                  {/* Table header */}
                                  <div style={{ display: 'grid', gridTemplateColumns: colTemplate, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center' }}>Metric</div>
                                    {compareDeals.map((d, i) => (
                                      <div key={i} style={{ padding: '10px 12px', borderLeft: '0.5px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#7C3AED', color: '#fff', fontSize: '9px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                                          <span style={{ fontSize: '11px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.dealName || d.address.split(',')[0]}</span>
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#94a3b8', paddingLeft: '22px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.address}</div>
                                      </div>
                                    ))}
                                  </div>
                                  {/* Metric rows */}
                                  {metricRows.map((row, ri) => {
                                    const rawVals = compareDeals.map(d => d.analytics?.[row.key]);
                                    const bestVal = row.higher != null ? getBest(rawVals.map(v => Number(v)), row.higher) : null;
                                    return (
                                      <div key={row.key} style={{ display: 'grid', gridTemplateColumns: colTemplate, borderBottom: ri < metricRows.length - 1 ? '0.5px solid #f1f5f9' : 'none', backgroundColor: ri % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <div style={{ padding: '9px 14px', fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center' }}>{row.label}</div>
                                        {compareDeals.map((d, ci) => {
                                          const raw = d.analytics?.[row.key];
                                          const isWinner = bestVal != null && Number(raw) === bestVal;
                                          return (
                                            <div key={ci} style={{ padding: '9px 12px', borderLeft: '0.5px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: isWinner ? '#f0fdf4' : 'transparent' }}>
                                              <span style={{ fontSize: '13px', fontWeight: isWinner ? '600' : '400', color: isWinner ? '#166534' : '#0f172a' }}>{row.renderVal(raw)}</span>
                                              {isWinner && <span style={{ fontSize: '10px', color: '#059669' }}>★</span>}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    );
                                  })}
                                  <div style={{ padding: '7px 14px', fontSize: '10px', color: '#94a3b8', borderTop: '0.5px solid #f1f5f9' }}>★ best value for that metric</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Right: selected deal */}
                        {!compareMode && activeDeal && an ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Verdict */}
                            <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: verdictBg(an.bidStrength), border: `1px solid ${verdictBorder(an.bidStrength)}` }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: verdictCol(an.bidStrength), marginBottom: '2px' }}>{an.verdict || (an.bidStrength?.toUpperCase() + ' BID')}</div>
                              <div style={{ fontSize: '11px', color: verdictCol(an.bidStrength), opacity: 0.8 }}>
                                {[an.epcRating && `EPC ${an.epcRating}`, an.floorArea, (an.propertyTypeFromReport || '').split('(')[0].trim(), an.auctionHouseFromReport].filter(Boolean).join(' · ')}
                              </div>
                            </div>

                            {/* KPI row */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                              {[
                                { label: 'Max safe bid', val: fmt(an.maxBid), sub: an.targetBid ? `target: ${fmt(an.targetBid)}` : `walk away: ${fmt(an.walkAway)}` },
                                { label: 'Net profit', val: fmt(an.netProfit), sub: `${an.margin || '—'}% margin · ${an.roi || '—'}% ROI`, green: true },
                                { label: 'Total investment', val: fmt(an.totalInvestment), sub: `fees: ${fmt(an.totalAuctionFees)}` },
                                { label: 'Guide price', val: fmt(an.guidePrice), sub: an.completionDate ? `Completion ${an.completionDate}` : `${an.comps || '—'} comparables` },
                              ].map(({ label, val, sub, green }) => (
                                <div key={label} style={{ backgroundColor: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '4px' }}>{label}</div>
                                  <div style={{ fontSize: '17px', fontWeight: '600', color: green ? '#3B6D11' : '#0f172a' }}>{val}</div>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{sub}</div>
                                </div>
                              ))}
                            </div>

                            {/* Matrix */}
                            <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Profit scenario matrix — hammer price × refurb cost</div>
                              <div style={{ display: 'flex', gap: '4px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                {[
                                  { key: 'conservative', label: `Conservative ${fmt(an.gdvConservative)}` },
                                  { key: 'base', label: `Base ${fmt(an.gdvBase)}` },
                                  { key: 'optimistic', label: `Optimistic ${fmt(an.gdvOptimistic)}` },
                                ].map(({ key, label }) => (
                                  <button key={key} onClick={() => setMatrixGdvTab(key)} style={{ padding: '5px 12px', fontSize: '12px', borderRadius: '20px', border: '0.5px solid #e2e8f0', cursor: 'pointer', backgroundColor: matrixGdvTab === key ? '#7C3AED' : 'transparent', color: matrixGdvTab === key ? '#fff' : '#64748b', fontWeight: matrixGdvTab === key ? '500' : '400' }}>{label}</button>
                                ))}
                              </div>
                              {curMatrix.length > 0 ? (
                                <div style={{ overflowX: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                    <thead>
                                      <tr>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: '10px', fontWeight: '500', color: '#64748b', backgroundColor: '#f8fafc', border: '0.5px solid #e2e8f0', whiteSpace: 'nowrap' }}>Hammer price</th>
                                        {(an.matrixHeaders || curMatrix[0]?.cells.map((_, i) => `Col ${i+1}`)).map((h, i) => (
                                          <th key={i} style={{ padding: '6px 8px', fontSize: '10px', fontWeight: '500', color: '#64748b', backgroundColor: '#f8fafc', border: '0.5px solid #e2e8f0', textAlign: 'center', whiteSpace: 'nowrap' }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {curMatrix.map((row) => {
                                        const isTarget = an.targetBid && row.hammer === an.targetBid;
                                        return (
                                          <tr key={row.hammer}>
                                            <td style={{ padding: '5px 8px', border: '0.5px solid #e2e8f0', fontWeight: '500', fontSize: '10px', color: '#0f172a', backgroundColor: isTarget ? '#EDE9FE' : '#f8fafc', whiteSpace: 'nowrap' }}>
                                              {row.label} {isTarget && <span style={{ fontSize: '9px', color: '#7C3AED', fontWeight: '700' }}>★</span>}
                                            </td>
                                            {row.cells.map((cell, ci) => {
                                              const cs = cellStyle(cell.margin);
                                              const isTargetCell = isTarget && ci === Math.floor(row.cells.length / 2);
                                              return (
                                                <td key={ci} style={{ padding: '5px 8px', border: '0.5px solid #e2e8f0', textAlign: 'center', backgroundColor: cs.bg, outline: isTargetCell ? '2px solid #7C3AED' : 'none', outlineOffset: '-2px' }}>
                                                  <div style={{ fontWeight: '500', color: cs.col }}>{cell.profit < 0 ? '-' : ''}£{Math.abs(cell.profit).toLocaleString()}</div>
                                                  <div style={{ fontSize: '10px', color: '#64748b' }}>{cell.margin}%</div>
                                                </td>
                                              );
                                            })}
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px' }}>★ = target bid · green ≥15% margin · amber 5–14% · red &lt;5% or loss</div>
                                </div>
                              ) : (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', backgroundColor: '#f8fafc', borderRadius: '6px' }}>Matrix not found in report — upload the HTML version of your Primary Assessment Report to see full scenario data</div>
                              )}
                            </div>

                            {/* Bid boxes */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                              {[
                                { key: 'walkAway', label: 'Walk away', sub: 'Hard ceiling — stop here', bg: '#FCEBEB', border: '#F09595', tc: '#A32D2D' },
                                { key: 'targetBid', label: 'Target bid', sub: 'Medium refurb · 15%+ margin', bg: '#EAF3DE', border: '#97C459', tc: '#3B6D11' },
                                { key: 'stretchBid', label: 'Stretch bid', sub: 'Light refurb · optimistic GDV', bg: '#FAEEDA', border: '#FAC775', tc: '#854F0B' },
                              ].map(({ key, label, sub, bg, border, tc }) => (
                                <div key={key} style={{ borderRadius: '8px', padding: '12px', textAlign: 'center', backgroundColor: bg, border: `0.5px solid ${border}` }}>
                                  <div style={{ fontSize: '10px', fontWeight: '500', color: tc, marginBottom: '4px' }}>{label}</div>
                                  <div style={{ fontSize: '20px', fontWeight: '600', color: tc }}>{fmt(an[key])}</div>
                                  <div style={{ fontSize: '10px', color: tc, marginTop: '3px', opacity: 0.8 }}>{sub}</div>
                                </div>
                              ))}
                            </div>

                            {/* Refurb + cost stack */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Refurb matrix</div>
                                {[
                                  { label: 'Light — cosmetic only', value: an.refurbLight, color: '#3B6D11' },
                                  { label: 'Medium — mid scope ★', value: an.refurbMedium, color: '#3B6D11', bold: true },
                                  { label: 'Heavy — full renovation', value: an.refurbHeavy, color: '#854F0B' },
                                ].map(({ label, value, color, bold }) => (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '0.5px solid #f1f5f9', fontSize: '12px' }}>
                                    <span style={{ color: '#64748b', fontWeight: bold ? '600' : '400' }}>{label}</span>
                                    <span style={{ color, fontWeight: '500' }}>{fmt(value)}</span>
                                  </div>
                                ))}
                                {an.breakEvenBid && <div style={{ marginTop: '8px', padding: '6px 8px', backgroundColor: '#FCEBEB', borderRadius: '5px', fontSize: '11px', color: '#A32D2D', textAlign: 'center' }}>Break-even bid: {fmt(an.breakEvenBid)}</div>}
                              </div>
                              <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Full cost stack</div>
                                {[
                                  { label: 'Acquisition fees', value: an.acquisitionFeesTotal },
                                  { label: "Buyer's premium", value: an.buyersPremium },
                                  { label: 'SDLT', value: an.sdlt },
                                  { label: 'Works (medium)', value: an.worksTotal },
                                  { label: 'Holding costs', value: an.holdingTotal },
                                  { label: 'Exit costs', value: an.exitTotal },
                                  { label: 'Total investment', value: an.totalInvestment, bold: true },
                                ].map(({ label, value, bold }) => value != null ? (
                                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid #f1f5f9', fontSize: '12px', fontWeight: bold ? '600' : '400' }}>
                                    <span style={{ color: '#64748b' }}>{label}</span>
                                    <span style={{ color: '#0f172a' }}>{fmt(value)}</span>
                                  </div>
                                ) : null)}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: TASKS & FOLLOW-UPS ==================== */}
              {activeTab === 'tasks' && (() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const filteredTasks = tasks.filter(t => {
                  if (taskFilter === 'open') return t.status === 'open';
                  if (taskFilter === 'done') return t.status === 'done';
                  if (taskFilter === 'overdue') return t.dueDate && t.dueDate < todayStr && t.status === 'open';
                  return true;
                }).sort((a, b) => {
                  if (!a.dueDate) return 1;
                  if (!b.dueDate) return -1;
                  return a.dueDate < b.dueDate ? -1 : 1;
                });
                const openCount = tasks.filter(t => t.status === 'open').length;
                const overdueCount = tasks.filter(t => t.dueDate && t.dueDate < todayStr && t.status === 'open').length;
                const doneCount = tasks.filter(t => t.status === 'done').length;
                const highCount = tasks.filter(t => t.priority === 'High' && t.status === 'open').length;
                const linkedOptions = newTaskLinkedType === 'Property' ? properties : newTaskLinkedType === 'Company' ? companies : newTaskLinkedType === 'Contact' ? contacts : [];
                const handleAddTask = (e) => {
                  e.preventDefault();
                  if (!newTaskTitle.trim()) return;
                  const linkedName = linkedOptions.find(x => x.id === parseInt(newTaskLinkedId))?.address || linkedOptions.find(x => x.id === parseInt(newTaskLinkedId))?.name || '';
                  setTasks([...tasks, { id: Date.now(), title: newTaskTitle, dueDate: newTaskDue, priority: newTaskPriority, status: 'open', linkedType: newTaskLinkedType, linkedId: newTaskLinkedId ? parseInt(newTaskLinkedId) : null, linkedName, notes: newTaskNotes, assignee: 'Ashley', createdDate: new Date().toISOString().split('T')[0] }]);
                  setNewTaskTitle(''); setNewTaskDue(''); setNewTaskPriority('Medium'); setNewTaskLinkedType(''); setNewTaskLinkedId(''); setNewTaskNotes('');
                };
                const priorityBadge = (p) => ({ High: { bg: '#fee2e2', color: '#991b1b' }, Medium: { bg: '#fef3c7', color: '#92400e' }, Low: { bg: '#f1f5f9', color: '#475569' } }[p] || { bg: '#f1f5f9', color: '#475569' });
                const dueDateColor = (t) => {
                  if (t.status === 'done') return '#94a3b8';
                  if (!t.dueDate) return '#475569';
                  if (t.dueDate < todayStr) return '#dc2626';
                  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
                  const tomorrowStr = tomorrow.toISOString().split('T')[0];
                  if (t.dueDate <= tomorrowStr) return '#d97706';
                  return '#475569';
                };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Stat cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {[['Open tasks', openCount, '#0f172a'], ['Overdue', overdueCount, '#dc2626'], ['Completed', doneCount, '#059669'], ['High priority', highCount, '#d97706']].map(([label, val, color]) => (
                        <div key={label} style={{ backgroundColor: '#ffffff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>{label}</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    {/* Add task form */}
                    <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Add task</div>
                      <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '8px', alignItems: 'end' }}>
                          <input type="text" required placeholder="Task title (required)" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                          <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                          <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="High">High priority</option>
                            <option value="Medium">Medium priority</option>
                            <option value="Low">Low priority</option>
                          </select>
                          <select value={newTaskLinkedType} onChange={e => { setNewTaskLinkedType(e.target.value); setNewTaskLinkedId(''); }} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                            <option value="">No link</option>
                            <option value="Property">Property</option>
                            <option value="Company">Company</option>
                            <option value="Contact">Contact</option>
                          </select>
                          {newTaskLinkedType ? (
                            <select value={newTaskLinkedId} onChange={e => setNewTaskLinkedId(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', backgroundColor: '#fff' }}>
                              <option value="">Select…</option>
                              {linkedOptions.map(x => <option key={x.id} value={x.id}>{x.address || x.name}</option>)}
                            </select>
                          ) : <div />}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                          <input type="text" placeholder="Notes (optional)" value={newTaskNotes} onChange={e => setNewTaskNotes(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                          <div style={{ fontSize: '11px', color: '#94a3b8', padding: '8px 0' }}>Assigned to: Ashley</div>
                          <button type="submit" style={{ padding: '8px 18px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add task</button>
                        </div>
                      </form>
                    </div>
                    {/* Filter buttons */}
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[['all', 'All'], ['open', 'Open'], ['done', 'Done'], ['overdue', 'Overdue']].map(([k, l]) => (
                        <button key={k} onClick={() => setTaskFilter(k)} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', backgroundColor: taskFilter === k ? '#0f172a' : '#fff', color: taskFilter === k ? '#fff' : '#475569', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{l}</button>
                      ))}
                    </div>
                    {/* Tasks table */}
                    {filteredTasks.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px', backgroundColor: '#ffffff' }}>
                        <ClipboardList size={24} style={{ marginBottom: '8px', opacity: 0.3 }} />
                        <div style={{ fontSize: '13px', fontWeight: '600' }}>No tasks found</div>
                        <div style={{ fontSize: '11px', marginTop: '3px' }}>Add a task above to get started</div>
                      </div>
                    ) : (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              <th style={{ padding: '10px 14px', width: '36px' }}></th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Task</th>
                              <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Linked record</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Due date</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Priority</th>
                              <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>Assignee</th>
                              <th style={{ padding: '10px 14px', width: '40px' }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTasks.map(task => {
                              const pb = priorityBadge(task.priority);
                              return (
                                <tr key={task.id} style={{ borderBottom: '1px solid #f1f5f9', opacity: task.status === 'done' ? 0.6 : 1 }}>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    <input type="checkbox" checked={task.status === 'done'} onChange={() => setTasks(tasks.map(t => t.id === task.id ? { ...t, status: t.status === 'done' ? 'open' : 'done' } : t))} style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                                  </td>
                                  <td style={{ padding: '10px 14px' }}>
                                    <div style={{ fontWeight: '600', color: '#0f172a', textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>{task.title}</div>
                                    {task.notes && <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{task.notes}</div>}
                                  </td>
                                  <td style={{ padding: '10px 14px' }}>
                                    {task.linkedType && task.linkedName ? (
                                      <button onClick={() => { if (task.linkedType === 'Property') { const p = properties.find(x => x.id === task.linkedId); if (p) { setCurrentViewProperty(p); setActiveTab('pipeline'); } } else if (task.linkedType === 'Company') { const c = companies.find(x => x.id === task.linkedId); if (c) { setCurrentViewCompany(c); setActiveTab('companies'); } } else if (task.linkedType === 'Contact') { const c = contacts.find(x => x.id === task.linkedId); if (c) { setCurrentViewContact(c); setActiveTab('contacts'); } } }} style={{ background: 'none', border: 'none', padding: 0, color: '#0284c7', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline' }}>
                                        {task.linkedType}: {task.linkedName}
                                      </button>
                                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: dueDateColor(task), fontSize: '11px' }}>{task.dueDate || '—'}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    <span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', fontWeight: '700', backgroundColor: pb.bg, color: pb.color }}>{task.priority}</span>
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center', fontSize: '12px', color: '#475569' }}>{task.assignee}</td>
                                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                    <button onClick={() => setTasks(tasks.filter(t => t.id !== task.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px' }}><Trash2 size={13} /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: SETTINGS (Option A — sidebar sections) ==================== */}
              {activeTab === 'settings' && (
                <div style={{ display: 'flex', gap: '0', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, flex: '1 1 0', overflow: isMobile ? 'auto' : 'hidden', backgroundColor: '#ffffff', borderRadius: isMobile ? '8px' : '12px', border: '1px solid #e2e8f0' }}>
                  {/* Left nav */}
                  <div style={{ width: isMobile ? '100%' : '200px', borderRight: isMobile ? 'none' : '1px solid #e2e8f0', borderBottom: isMobile ? '1px solid #e2e8f0' : 'none', padding: '12px', display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: isMobile ? 'wrap' : 'nowrap', gap: '4px', flexShrink: 0 }}>
                    {[['profile', 'Profile'], ['appearance', 'Appearance'], ['notifications', 'Notifications'], ['users', 'Users & Permissions'], ['api', 'API Keys'], ['integrations', 'Integrations'], ['data', 'Data Management']].map(([key, label]) => (
                      <button key={key} onClick={() => setSettingsSection(key)} style={{ padding: '9px 12px', textAlign: 'left', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '500', backgroundColor: settingsSection === key ? '#f0fdf4' : 'transparent', color: settingsSection === key ? '#059669' : '#64748b', borderLeft: settingsSection === key ? '2px solid #059669' : '2px solid transparent' }}>{label}</button>
                    ))}
                  </div>
                  {/* Right content */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>

                    {/* PROFILE */}
                    {settingsSection === 'profile' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {/* Profile info */}
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Profile</div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                            <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Full name</label><input type="text" value={settingsProfile.name} onChange={e => setSettingsProfile({ ...settingsProfile, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                            <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Email</label><input type="email" value={settingsProfile.email} onChange={e => setSettingsProfile({ ...settingsProfile, email: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                            <div style={{ gridColumn: '1/-1' }}><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Company</label><input type="text" value={settingsProfile.company} onChange={e => setSettingsProfile({ ...settingsProfile, company: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                          </div>
                          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={handleSaveSettings} style={{ padding: '10px 22px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Save changes</button>
                            {settingsSaved && <span style={{ fontSize: '12px', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Saved</span>}
                          </div>
                        </div>

                        {/* Change password */}
                        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Change Password</div>
                          <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '400px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Current password</label>
                              <input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} required autoComplete="current-password" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>New password</label>
                              <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} required minLength={8} autoComplete="new-password" placeholder="At least 8 characters" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Confirm new password</label>
                              <input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} required autoComplete="new-password" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                            </div>
                            {pwStatus && (
                              <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '600', backgroundColor: pwStatus.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwStatus.type === 'success' ? '#065f46' : '#991b1b', border: `1px solid ${pwStatus.type === 'success' ? '#a7f3d0' : '#fca5a5'}` }}>
                                {pwStatus.type === 'success' ? '✅' : '❌'} {pwStatus.message}
                              </div>
                            )}
                            <div>
                              <button type="submit" disabled={pwSaving} style={{ padding: '10px 22px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: pwSaving ? 'not-allowed' : 'pointer', opacity: pwSaving ? 0.7 : 1 }}>
                                {pwSaving ? 'Updating…' : 'Update password'}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}

                    {/* APPEARANCE */}
                    {settingsSection === 'appearance' && (
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>Appearance</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
                          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Accent colour</label><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><input type="color" value={settingsTheme.accentColor} onChange={e => setSettingsTheme({ ...settingsTheme, accentColor: e.target.value })} style={{ width: '44px', height: '40px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', padding: '2px' }} /><span style={{ fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>{settingsTheme.accentColor}</span></div></div>
                          <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Sidebar colour</label><div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><input type="color" value={settingsTheme.sidebarColor} onChange={e => setSettingsTheme({ ...settingsTheme, sidebarColor: e.target.value })} style={{ width: '44px', height: '40px', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', padding: '2px' }} /><span style={{ fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>{settingsTheme.sidebarColor}</span></div></div>
                        </div>
                        <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '12px', color: '#64748b' }}>
                          Preview: <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', backgroundColor: settingsTheme.accentColor, color: '#fff', fontWeight: 'bold', fontSize: '12px', marginLeft: '8px' }}>Active Tab</span>
                          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '4px', backgroundColor: settingsTheme.sidebarColor, color: '#fff', fontSize: '12px', marginLeft: '8px' }}>Sidebar</span>
                        </div>
                      </div>
                    )}

                    {/* NOTIFICATIONS */}
                    {settingsSection === 'notifications' && (() => {
                      const Toggle = ({ on, onToggle }) => (
                        <div onClick={onToggle} style={{ width: '44px', height: '24px', borderRadius: '12px', backgroundColor: on ? '#059669' : '#cbd5e1', cursor: 'pointer', position: 'relative', flexShrink: 0 }}>
                          <div style={{ position: 'absolute', top: '3px', left: on ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                        </div>
                      );
                      const Row = ({ label, desc, on, onToggle, children }) => (
                        <div style={{ padding: '14px 16px', backgroundColor: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                            <div><div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{label}</div><div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{desc}</div></div>
                            <Toggle on={on} onToggle={onToggle} />
                          </div>
                          {on && children}
                        </div>
                      );
                      return (
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '4px' }}>Email Notifications</div>
                          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '20px' }}>Your personal preferences — each user controls their own. Emails sent via Resend.</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <Row
                              label="New property added"
                              desc="Email when any team member adds a property to the pipeline"
                              on={settingsNotifications.newProperty}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, newProperty: !p.newProperty }))}
                            />
                            <Row
                              label="Auction countdown alerts"
                              desc="Reminder emails before upcoming auction dates"
                              on={settingsNotifications.auctionCountdown}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, auctionCountdown: !p.auctionCountdown }))}
                            >
                              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>Alert me when auction is:</div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                  {[14, 7, 3, 1].map(d => {
                                    const active = (settingsNotifications.countdownDays || []).includes(d);
                                    return (
                                      <button key={d} onClick={() => {
                                        const days = settingsNotifications.countdownDays || [];
                                        setSettingsNotifications(p => ({ ...p, countdownDays: active ? days.filter(x => x !== d) : [...days, d].sort((a,b) => b-a) }));
                                      }} style={{ padding: '6px 14px', borderRadius: '20px', border: `1px solid ${active ? '#059669' : '#cbd5e1'}`, backgroundColor: active ? '#f0fdf4' : '#fff', color: active ? '#065f46' : '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                                        {d} day{d > 1 ? 's' : ''} before
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </Row>
                            <Row
                              label="Notes added by others"
                              desc="Email when another team member adds a note to any property"
                              on={settingsNotifications.noteAdded}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, noteAdded: !p.noteAdded }))}
                            />
                            <Row
                              label="New user invited"
                              desc="Email when a new user is invited to the CRM"
                              on={settingsNotifications.newUser}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, newUser: !p.newUser }))}
                            />
                            <Row
                              label="New contact added"
                              desc="Email when any team member adds a new contact to the CRM"
                              on={settingsNotifications.newContact}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, newContact: !p.newContact }))}
                            />
                            <Row
                              label="New company added"
                              desc="Email when any team member adds a new company to the CRM"
                              on={settingsNotifications.newCompany}
                              onToggle={() => setSettingsNotifications(p => ({ ...p, newCompany: !p.newCompany }))}
                            />
                          </div>
                          <div style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={() => saveNotifSettings(settingsNotifications)} disabled={notifSaving} style={{ padding: '10px 22px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: notifSaving ? 0.7 : 1 }}>
                              {notifSaving ? 'Saving…' : 'Save preferences'}
                            </button>
                            {notifSaved && <span style={{ fontSize: '12px', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Saved</span>}
                          </div>

                          {/* ── ADMIN: Team notification control ── */}
                          {user.role === 'Admin' && (
                            <div style={{ marginTop: '32px', paddingTop: '28px', borderTop: '2px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <div>
                                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>Team notification control</div>
                                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Super admin only — override notification settings for any team member.</div>
                                </div>
                                {!allUserNotifSettings && (
                                  <button onClick={loadAllUserNotifSettings} disabled={allUserNotifLoading} style={{ padding: '8px 16px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: allUserNotifLoading ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                                    {allUserNotifLoading ? 'Loading…' : 'Load team settings'}
                                  </button>
                                )}
                              </div>

                              {allUserNotifSettings && (() => {
                                const NOTIF_KEYS = [
                                  { key: 'newProperty', label: 'New property' },
                                  { key: 'auctionCountdown', label: 'Auction countdown' },
                                  { key: 'noteAdded', label: 'Notes added' },
                                  { key: 'newUser', label: 'New user' },
                                ];
                                return (
                                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {allUserNotifSettings.map(u => {
                                      const isSelf = u.id === (user.id || '1');
                                      return (
                                        <div key={u.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                          {/* User header */}
                                          <div style={{ padding: '12px 16px', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: u.role === 'Admin' ? '#0f172a' : '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                                              {u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{u.name}{isSelf ? ' (you)' : ''}</div>
                                              <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                                            </div>
                                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', background: u.role === 'Admin' ? '#0f172a' : '#eff6ff', color: u.role === 'Admin' ? '#fff' : '#1e40af' }}>{u.role}</span>
                                          </div>
                                          {/* Notification toggles */}
                                          <div style={{ padding: '12px 16px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            {NOTIF_KEYS.map(({ key, label }) => {
                                              const on = !!u.prefs[key];
                                              return (
                                                <button
                                                  key={key}
                                                  onClick={() => {
                                                    const updated = { ...u.prefs, [key]: !on };
                                                    setAllUserNotifSettings(prev => prev.map(x => x.id === u.id ? { ...x, prefs: updated } : x));
                                                  }}
                                                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '20px', border: `1px solid ${on ? '#059669' : '#e2e8f0'}`, background: on ? '#f0fdf4' : '#fff', color: on ? '#166534' : '#94a3b8', fontSize: '12px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}
                                                >
                                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: on ? '#059669' : '#cbd5e1', flexShrink: 0 }} />
                                                  {label}
                                                </button>
                                              );
                                            })}
                                            {/* Countdown days — shown inline when auctionCountdown is on */}
                                            {u.prefs.auctionCountdown && (
                                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', paddingLeft: '4px', borderLeft: '1px solid #e2e8f0' }}>
                                                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Days:</span>
                                                {[14, 7, 3, 1].map(d => {
                                                  const active = (u.prefs.countdownDays || []).includes(d);
                                                  return (
                                                    <button key={d} onClick={() => {
                                                      const days = u.prefs.countdownDays || [];
                                                      const updated = { ...u.prefs, countdownDays: active ? days.filter(x => x !== d) : [...days, d].sort((a,b) => b-a) };
                                                      setAllUserNotifSettings(prev => prev.map(x => x.id === u.id ? { ...x, prefs: updated } : x));
                                                    }} style={{ padding: '3px 8px', borderRadius: '10px', border: `1px solid ${active ? '#059669' : '#e2e8f0'}`, background: active ? '#f0fdf4' : '#fff', color: active ? '#166534' : '#94a3b8', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                      {d}d
                                                    </button>
                                                  );
                                                })}
                                              </div>
                                            )}
                                          </div>
                                          {/* Save row */}
                                          <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <button onClick={() => saveUserNotifSettings(u.id, u.prefs)} disabled={!!userNotifSaving[u.id]} style={{ padding: '6px 16px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', opacity: userNotifSaving[u.id] ? 0.6 : 1, fontFamily: 'inherit' }}>
                                              {userNotifSaving[u.id] ? 'Saving…' : 'Save'}
                                            </button>
                                            {userNotifSaved[u.id] && <span style={{ fontSize: '12px', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={13} /> Saved</span>}
                                          </div>
                                        </div>
                                      );
                                    })}
                                    <button onClick={loadAllUserNotifSettings} style={{ alignSelf: 'flex-start', padding: '6px 14px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>↻ Refresh</button>
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* USERS */}
                    {settingsSection === 'users' && (() => {
                      if (!crmUsersLoaded) { loadCrmUsers(); }
                      const getInviteStatus = (u) => {
                        if (u.lastLogin) return { label: 'Active', bg: '#dcfce7', color: '#166534' };
                        if (u.verified) return { label: 'Accepted', bg: '#dbeafe', color: '#1e40af' };
                        return { label: 'Pending', bg: '#fef3c7', color: '#92400e' };
                      };
                      const fmtDate = (iso) => {
                        if (!iso) return null;
                        const d = new Date(iso);
                        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                      };
                      return (
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Users & Permissions</div>
                          <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '8px', marginBottom: '20px', alignItems: 'end' }}>
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>FULL NAME</div>
                              <input type="text" placeholder="Jane Smith" value={newUserName} onChange={e => setNewUserName(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }} />
                            </div>
                            <div>
                              <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>EMAIL (required for invite)</div>
                              <input type="email" placeholder="jane@example.com" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }} />
                            </div>
                            <select value={newUserRole} onChange={e => setNewUserRole(e.target.value)} style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff' }}>
                              <option value="Admin">Admin</option><option value="Member">Member</option><option value="Viewer">Viewer</option>
                            </select>
                            <button type="submit" style={{ padding: '8px 14px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Send Invite</button>
                          </form>
                          {lastInviteLink && (
                            <div style={{ backgroundColor: lastInviteLink.emailSent ? '#f0fdf4' : '#fffbeb', border: `1px solid ${lastInviteLink.emailSent ? '#a7f3d0' : '#fcd34d'}`, borderRadius: '10px', padding: '14px 16px', marginBottom: '16px' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: lastInviteLink.emailSent ? '#065f46' : '#92400e', marginBottom: '6px' }}>
                                {lastInviteLink.emailSent ? '✓ Invite email sent! Link also available below:' : '⚠ Email not delivered — share this link manually:'}
                              </div>
                              {lastInviteLink.emailError && <div style={{ fontSize: '11px', color: '#b45309', backgroundColor: '#fef3c7', padding: '6px 10px', borderRadius: '6px', marginBottom: '8px', fontFamily: 'monospace' }}>Resend error: {lastInviteLink.emailError}</div>}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input readOnly value={lastInviteLink.link} style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #a7f3d0', fontSize: '11px', fontFamily: 'monospace', backgroundColor: '#fff', color: '#064e3b' }} onClick={e => e.target.select()} />
                                <button onClick={() => { navigator.clipboard.writeText(lastInviteLink.link); }} style={{ padding: '8px 12px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Copy</button>
                                <button onClick={() => setLastInviteLink(null)} style={{ padding: '8px', backgroundColor: 'transparent', color: '#64748b', border: 'none', cursor: 'pointer' }}><X size={14} /></button>
                              </div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>Expires in 48 hours.</div>
                            </div>
                          )}
                          {/* EDIT VIEW — chip row for one user */}
                          {permEditUserId !== null && (() => {
                            const eu = crmUsers.find(u => u.id === permEditUserId);
                            if (!eu) return null;
                            const isAdmin = eu.role === 'Admin';
                            const initials = eu.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                            const avatarBg = eu.role === 'Admin' ? '#0f172a' : eu.role === 'Viewer' ? '#92400e' : '#0284c7';
                            return (
                              <div>
                                <button onClick={() => setPermEditUserId(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', marginBottom: '16px' }}>
                                  <ChevronLeft size={13} /> Back to users
                                </button>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', padding: '9px 14px', backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontSize: '10px', fontWeight: '700', color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    <span>User</span>
                                    <span style={{ paddingLeft: '14px' }}>Tab access — click to toggle</span>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '160px', flexShrink: 0 }}>
                                      <div style={{ width: '34px', height: '34px', borderRadius: '50%', backgroundColor: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{initials}</div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eu.name.split(' ')[0]}</div>
                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{eu.role}</div>
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', flex: 1 }}>
                                      {ALL_TABS.map(tab => {
                                        const on = (eu.allowedTabs || []).includes(tab.key);
                                        return (
                                          <span
                                            key={tab.key}
                                            onClick={() => !isAdmin && toggleUserTab(eu.id, tab.key)}
                                            style={{ display: 'inline-flex', alignItems: 'center', fontSize: '12px', padding: '5px 12px', borderRadius: '20px', cursor: isAdmin ? 'default' : 'pointer', userSelect: 'none', border: `1px solid ${on ? '#86efac' : '#e2e8f0'}`, backgroundColor: on ? '#f0fdf4' : '#f8fafc', color: on ? '#166534' : '#94a3b8', opacity: isAdmin ? 0.6 : 1 }}
                                          >
                                            {tab.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  </div>
                                  {isAdmin && (
                                    <div style={{ padding: '10px 14px', borderTop: '1px solid #e2e8f0', backgroundColor: '#f8fafc', fontSize: '11px', color: '#64748b' }}>
                                      Admin users always have full access — tabs cannot be restricted.
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* CARD GRID VIEW */}
                          {permEditUserId === null && (
                            <div>
                              {!crmUsersLoaded && <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>Loading users…</div>}
                              {crmUsersLoaded && crmUsers.length === 0 && <div style={{ fontSize: '13px', color: '#94a3b8', textAlign: 'center', padding: '20px' }}>No users found. Invite someone above.</div>}
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
                                {crmUsers.map(u => {
                                  const inv = getInviteStatus(u);
                                  const isAdmin = u.role === 'Admin';
                                  const tabs = u.allowedTabs || [];
                                  const pct = Math.round(tabs.length / ALL_TABS.length * 100);
                                  const initials = u.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
                                  const avatarBg = u.role === 'Admin' ? '#0f172a' : u.role === 'Viewer' ? '#92400e' : '#0284c7';
                                  return (
                                    <div key={u.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', backgroundColor: '#fff' }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                                          <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: avatarBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>{initials}</div>
                                          <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name.split(' ')[0]}</div>
                                            <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px', backgroundColor: u.role === 'Admin' ? '#fef3c7' : '#e0f2fe', color: u.role === 'Admin' ? '#92400e' : '#0369a1' }}>{u.role}</span>
                                              <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 6px', borderRadius: '8px', backgroundColor: inv.bg, color: inv.color }}>{inv.label}</span>
                                            </div>
                                          </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                                          <button onClick={() => setPermEditUserId(u.id)} title="Edit permissions" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', cursor: 'pointer' }}>
                                            <Pencil size={11} /> Edit
                                          </button>
                                          <button onClick={() => handleRemoveUser(u.id)} title="Delete user" style={{ padding: '4px 6px', borderRadius: '6px', border: '1px solid #fee2e2', background: '#fff', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                            <Trash2 size={11} />
                                          </button>
                                        </div>
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>
                                        {isAdmin ? 'Full access' : `${tabs.length} of ${ALL_TABS.length} tabs`}
                                      </div>
                                      <div style={{ height: '4px', backgroundColor: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginBottom: '9px' }}>
                                        <div style={{ height: '100%', width: `${isAdmin ? 100 : pct}%`, backgroundColor: isAdmin ? '#7c3aed' : '#059669', borderRadius: '2px' }} />
                                      </div>
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '10px' }}>
                                        {ALL_TABS.map((tab, j) => (
                                          <div key={tab.key} title={tab.label} style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: (isAdmin || tabs.includes(tab.key)) ? (isAdmin ? '#7c3aed' : '#059669') : '#e2e8f0' }} />
                                        ))}
                                      </div>
                                      <div style={{ fontSize: '10px', color: u.lastLogin ? '#64748b' : '#94a3b8' }}>
                                        Last login: {u.lastLogin ? fmtDate(u.lastLogin) : 'Never'}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* API KEYS */}
                    {settingsSection === 'api' && (
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>API Keys</div>
                        <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Google Maps Embed API Key</label><input type="text" value={settingsMapsKey} onChange={e => setSettingsMapsKey(e.target.value)} placeholder="AIza..." style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box' }} /><p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Used for property map views. Set in your .env file as VITE_GOOGLE_MAPS_KEY.</p></div>
                      </div>
                    )}

                    {/* INTEGRATIONS */}
                    {settingsSection === 'integrations' && (
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>Integrations</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                            <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a', marginBottom: '4px' }}>Companies House API</div>
                            <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '12px' }}>Free key from <a href="https://developer.companieshouse.gov.uk" target="_blank" rel="noreferrer" style={{ color: '#0284c7' }}>developer.companieshouse.gov.uk</a></div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <input type="text" value={settingsIntegrations.companiesHouse} onChange={e => setSettingsIntegrations({ ...settingsIntegrations, companiesHouse: e.target.value })} placeholder="Enter your API key" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                              <button onClick={() => { localStorage.setItem('ch_api_key', settingsIntegrations.companiesHouse); alert('Companies House API key saved.'); }} style={{ padding: '8px 16px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Save key</button>
                            </div>
                          </div>
                          {/* Google Calendar */}
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '16px' }}>🗓</span>
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Google Calendar</span>
                                  {calendarStatus.google && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: '700' }}>Connected</span>}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Add auction dates and tasks to your Google Calendar. Requires a Google Cloud project with the Calendar API enabled and OAuth2 client credentials set as <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> worker secrets.</div>
                              </div>
                              {calendarStatus.google ? (
                                <button onClick={() => disconnectCalendar('google')} style={{ padding: '7px 14px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Disconnect</button>
                              ) : (
                                <button onClick={() => { window.location.href = '/api/calendar/google/auth'; }} style={{ padding: '7px 14px', backgroundColor: '#1a73e8', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Connect ↗</button>
                              )}
                            </div>
                          </div>

                          {/* Outlook Calendar */}
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontSize: '16px' }}>📆</span>
                                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Outlook / Microsoft 365</span>
                                  {calendarStatus.microsoft && <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1e40af', fontWeight: '700' }}>Connected</span>}
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Add auction dates and tasks to Outlook or any Microsoft 365 calendar. Requires an Azure app registration with <code>Calendars.ReadWrite</code> permission and secrets set as <code>MICROSOFT_CLIENT_ID</code> and <code>MICROSOFT_CLIENT_SECRET</code>.</div>
                              </div>
                              {calendarStatus.microsoft ? (
                                <button onClick={() => disconnectCalendar('microsoft')} style={{ padding: '7px 14px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Disconnect</button>
                              ) : (
                                <button onClick={() => { window.location.href = '/api/calendar/microsoft/auth'; }} style={{ padding: '7px 14px', backgroundColor: '#0078d4', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>Connect ↗</button>
                              )}
                            </div>
                          </div>

                          {/* Resend */}
                          <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Resend (Email)</div>
                              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>Auction countdown alerts & reminders — key stored as <code>RESEND_API_KEY</code> worker secret</div>
                            </div>
                            <span style={{ fontSize: '10px', padding: '3px 8px', borderRadius: '10px', backgroundColor: '#f1f5f9', color: '#94a3b8', fontWeight: '600', border: '1px solid #e2e8f0' }}>Coming soon</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* DATA MANAGEMENT */}
                    {settingsSection === 'data' && (
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '20px' }}>Data Management</div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <button onClick={handleExportData} style={{ padding: '10px 20px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Export all data (JSON)</button>
                          <button onClick={handleClearPipeline} style={{ padding: '10px 20px', backgroundColor: '#fff', color: '#dc2626', border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Clear pipeline</button>
                        </div>
                        <p style={{ margin: '12px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Export downloads all properties, companies, contacts and notes as JSON. Clear pipeline is irreversible.</p>
                      </div>
                    )}

                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}


      {/* ==================== MODAL: DUPLICATE PROPERTY CHECK ==================== */}
      {duplicateModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Possible existing property found</div>
              <button onClick={() => setDuplicateModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              This assessment report may match a property already in your pipeline. Would you like to update the existing record instead of creating a new one?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
              {duplicateModal.matches.map(match => (
                <div key={match.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', background: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '3px' }}>{match.address}</div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {match.reasons.map(r => <span key={r} style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8' }}>{r}</span>)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: match.confidence >= 70 ? '#166534' : '#92400e' }}>{match.confidence}% match</div>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>{match.status}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const target = properties.find(p => p.id === match.id);
                      if (!target) return;
                      const updatedProp = applyReportToProperty(target, duplicateModal.pendingAnalytics, duplicateModal.pendingFileRecord, 'mainReport');
                      const updatedProperties = properties.map(p => p.id === target.id ? updatedProp : p);
                      setProperties(updatedProperties);
                      setCurrentViewProperty(updatedProp);
                      setDuplicateModal(null);
                      const token = localStorage.getItem('crm_session');
                      setSaveStatus('saving');
                      fetch('/api/crm-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }),
                      }).then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }).catch(() => setSaveStatus('idle'));
                    }}
                    style={{ marginTop: '8px', width: '100%', padding: '7px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Update this record with the report
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  // Continue uploading to the current property anyway
                  if (!currentViewProperty || !duplicateModal.pendingAnalytics || !duplicateModal.pendingFileRecord) { setDuplicateModal(null); return; }
                  const updatedProp = applyReportToProperty(currentViewProperty, duplicateModal.pendingAnalytics, duplicateModal.pendingFileRecord, 'mainReport');
                  const updatedProperties = properties.map(p => p.id === currentViewProperty.id ? updatedProp : p);
                  setCurrentViewProperty(updatedProp);
                  setProperties(updatedProperties);
                  setDuplicateModal(null);
                  const token = localStorage.getItem('crm_session');
                  setSaveStatus('saving');
                  fetch('/api/crm-data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }),
                  }).then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }).catch(() => setSaveStatus('idle'));
                }}
                style={{ flex: 1, padding: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Keep as separate record
              </button>
              <button onClick={() => setDuplicateModal(null)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', color: '#94a3b8', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MODAL: ADD PROPERTY ==================== */}
      {showAddPropertyModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddPropertyModal(false)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '440px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Add property</div>
              <button onClick={() => setShowAddPropertyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}><X size={18} /></button>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (!newPropAddress.trim()) return;
              const newProp = { id: Date.now(), address: newPropAddress.trim(), guidePrice: parseFloat(newPropGuide) || 0, auctionDate: newPropDate, status: 'Sourced', sourcePlatform: newPropPlatform || 'Manual', propertyType: newPropType, bedrooms: 0, maxBid: 0, auctionTime: '', isStrongBid: false, isConsideration: false, planningToBid: false, notesList: [], files: {}, surveyJobs: [], checklist: { legalReviewed: false, financeApproved: false, costsPriced: false }, activityLog: [{ id: Date.now() + Math.random(), type: 'created', detail: 'Property created', user: user.name || 'You', at: new Date().toISOString() }] };
              setProperties(prev => [...prev, newProp]);
              fireNotif('/api/notify/property-added', { property: newProp, addedBy: user.name || 'A team member' });
              setShowAddPropertyModal(false);
            }} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Property address *</label>
                <input type="text" placeholder="e.g. 12 Church Street, Sheffield, S1 2GX" value={newPropAddress} onChange={e => setNewPropAddress(e.target.value)} autoFocus style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Guide price (£)</label>
                  <input type="number" placeholder="e.g. 150000" value={newPropGuide} onChange={e => setNewPropGuide(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Auction date</label>
                  <input type="date" value={newPropDate} onChange={e => setNewPropDate(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Auction house</label>
                  <select value={newPropPlatform} onChange={e => setNewPropPlatform(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}>
                    <option value="">— Select or type —</option>
                    {companies.filter(c => c.type === 'Auction House').map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="Manual">Other / Manual</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Property type</label>
                  <select value={newPropType} onChange={e => setNewPropType(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}>
                    <option value="Residential">Residential</option>
                    <option value="Commercial">Commercial</option>
                    <option value="HMO">HMO</option>
                    <option value="Land">Land</option>
                    <option value="Mixed Use">Mixed Use</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                <button type="submit" style={{ flex: 1, padding: '11px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>Add to pipeline</button>
                <button type="button" onClick={() => setShowAddPropertyModal(false)} style={{ flex: 1, padding: '11px', backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MODAL: LOG SURVEY JOB ==================== */}
      {showSurveyJobModal && currentViewProperty && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowSurveyJobModal(false)}>
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '15px', fontWeight: '700', color: '#0f172a' }}>Log survey job</div>
              <button onClick={() => setShowSurveyJobModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}><X size={18} /></button>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '18px' }}>{currentViewProperty.dealName || currentViewProperty.address}</div>
            <form onSubmit={handleAddSurveyJob} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Surveyor *</label>
                <select value={surveyJobContactId} onChange={e => setSurveyJobContactId(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}>
                  <option value="">— Select surveyor contact —</option>
                  {contacts.filter(c => c.role === 'Surveyor').map(c => {
                    const co = companies.find(comp => comp.id === c.companyId);
                    return <option key={c.id} value={c.id}>{c.name}{co ? ` (${co.name})` : ''}</option>;
                  })}
                  {contacts.filter(c => c.role === 'Surveyor').length === 0 && <option disabled>No surveyor contacts — add one in Contacts tab with role "Surveyor"</option>}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Date booked</label>
                  <input type="date" value={surveyJobDateBooked} onChange={e => setSurveyJobDateBooked(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Survey appointment date</label>
                  <input type="date" value={surveyJobSurveyDate} onChange={e => setSurveyJobSurveyDate(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Report received</label>
                  <input type="date" value={surveyJobDateReceived} onChange={e => setSurveyJobDateReceived(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Turnaround time</label>
                  <input type="text" placeholder="e.g. 5-7 days" value={surveyJobTurnaroundRange} onChange={e => setSurveyJobTurnaroundRange(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Cost (£)</label>
                <input type="number" placeholder="e.g. 450" value={surveyJobCost} onChange={e => setSurveyJobCost(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '7px' }}>Rating</label>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {[1,2,3,4,5].map(n => (
                    <button key={n} type="button" onClick={() => setSurveyJobRating(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontSize: '24px', color: surveyJobRating >= n ? '#eab308' : '#e2e8f0', lineHeight: 1 }}>★</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Notes</label>
                <textarea value={surveyJobNotes} onChange={e => setSurveyJobNotes(e.target.value)} placeholder="Quality of report, any issues, recommendations…" rows={2} style={{ width: '100%', padding: '9px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: '600', color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={surveyJobWouldUse} onChange={e => setSurveyJobWouldUse(e.target.checked)} />
                Would use this surveyor again
              </label>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button type="submit" disabled={!surveyJobContactId} style={{ flex: 1, padding: '11px', backgroundColor: surveyJobContactId ? '#059669' : '#cbd5e1', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: surveyJobContactId ? 'pointer' : 'default' }}>Save survey job</button>
                <button type="button" onClick={() => setShowSurveyJobModal(false)} style={{ flex: 1, padding: '11px', backgroundColor: '#fff', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}