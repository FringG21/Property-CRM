const _v = '4.14';
import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import {
  LayoutDashboard, Building2, MapPin, Upload, ArrowLeft, FileText, Code,
  CheckSquare, Square, Calendar, DollarSign, Clock, Star, ExternalLink,
  SlidersHorizontal, Home, CheckCircle2, AlertCircle, X, Check, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, Undo2, Bookmark, User, Gavel, Settings, Users, Link2, Plus, Trash2,
  Briefcase, Contact, Search, Globe, Mail, Phone, ClipboardList, TrendingUp, LogOut, Filter, Map, BarChart2, Pencil,
  Bell, Download, MessageSquare, ListChecks, Activity, AlertTriangle, MoreHorizontal, Layers, RefreshCw
} from 'lucide-react';

// Fix Leaflet default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const NOTE_TYPE_COLORS = { Review: '#7f77dd', 'Survey update': '#1d9e75', Legal: '#ba7517', Finance: '#378add', Task: '#8b5cf6', Flag: '#e24b4a', Call: '#0ea5e9', Meeting: '#7c3aed', Email: '#d97706' };
const NOTE_TYPE_BG     = { Review: '#eeedfe', 'Survey update': '#e1f5ee', Legal: '#faeeda', Finance: '#e6f1fb', Task: '#ede9fe', Flag: '#fcebeb', Call: '#e0f2fe', Meeting: '#ede9fe', Email: '#fefce8' };
const NOTE_TYPE_TEXT   = { Review: '#3c3489', 'Survey update': '#085041', Legal: '#633806', Finance: '#0c447c', Task: '#5b21b6', Flag: '#791f1f', Call: '#0c4a6e', Meeting: '#4c1d95', Email: '#713f12' };
const NOTE_TYPE_PLACEHOLDERS = {
  Review: 'Write a review note about this property…',
  'Survey update': 'Log a survey update — findings, concerns, next steps…',
  Legal: 'Note a legal point — title issues, restrictions, caveats…',
  Finance: 'Record a finance note — costs, funding, lender update…',
  Task: 'Describe the action needed and who is responsible…',
  Flag: 'Flag a risk or concern that needs attention…',
  Call: 'Log a call — who you spoke to, key points discussed…',
  Meeting: 'Describe the meeting — agenda, outcomes, follow-ups…',
  Email: 'Summarise the email thread — subject, decision, next step…',
};

// ============================================================
// REFURB QUOTE BUILDER — CONSTANTS (outside component for performance)
// ============================================================
const TRADE_CATEGORIES = [
  'Electrician','Plumber/Heating','Plasterer','Painter/Decorator','Roofer',
  'Kitchen Fitter','Bathroom Fitter','Flooring','Damp Specialist','Carpenter/Joiner',
  'Builder/Groundworks','Bricklayer','Windows/Doors','Scaffolding','Surveyor',
  'Structural Engineer','Asbestos Testing/Removal','Building Control','Skip/Waste',
  'Pest Control','Drainage','Fire Safety/Alarms','Snagging','Cleaning/Clearance',
  'Staging','Landscaping','Full Refurb Company','Other',
];

const PRICING_METHODS = [
  { key:'labour_materials', label:'Labour + Materials' },
  { key:'labour_only', label:'Labour Only' },
  { key:'materials_only', label:'Materials Only' },
  { key:'fixed', label:'Fixed Total Quote' },
  { key:'day_rate', label:'Day Rate' },
  { key:'per_m2', label:'Per m²' },
  { key:'per_room', label:'Per Room' },
  { key:'per_item', label:'Per Item' },
  { key:'per_socket', label:'Per Socket' },
  { key:'per_radiator', label:'Per Radiator' },
  { key:'per_linear_m', label:'Per Linear Metre' },
  { key:'custom', label:'Custom' },
];

const QUOTE_STATUSES = ['needed','requested','received','reviewing','accepted','rejected','booked','in_progress','complete','paid'];

const QUOTE_STATUS_COLORS = {
  needed:     { bg:'#fef3c7', color:'#92400e' },
  requested:  { bg:'#eff6ff', color:'#1d4ed8' },
  received:   { bg:'#f5f3ff', color:'#6d28d9' },
  reviewing:  { bg:'#fff7ed', color:'#c2410c' },
  accepted:   { bg:'#dcfce7', color:'#166534' },
  rejected:   { bg:'#fee2e2', color:'#991b1b' },
  booked:     { bg:'#d1fae5', color:'#065f46' },
  in_progress:{ bg:'#fef9c3', color:'#854d0e' },
  complete:   { bg:'#ccfbf1', color:'#0f766e' },
  paid:       { bg:'#e0e7ff', color:'#3730a3' },
};

// Trade sequencing — defines the rough build order for timeline view
const TRADE_SEQUENCE = [
  'Scaffolding','Asbestos Testing/Removal','Surveyor','Structural Engineer',
  'Builder/Groundworks','Bricklayer','Roofer','Drainage',
  'Damp Specialist','Electrician','Plumber/Heating','Plasterer',
  'Carpenter/Joiner','Windows/Doors','Kitchen Fitter','Bathroom Fitter',
  'Painter/Decorator','Flooring','Fire Safety/Alarms','Pest Control',
  'Snagging','Cleaning/Clearance','Staging','Landscaping','Skip/Waste',
];

// Dependency map: trades that must be done BEFORE this trade starts
const TRADE_DEPS = {
  'Electrician':            ['Builder/Groundworks','Roofer','Damp Specialist'],
  'Plumber/Heating':        ['Builder/Groundworks','Roofer'],
  'Damp Specialist':        ['Builder/Groundworks','Roofer'],
  'Plasterer':              ['Electrician','Plumber/Heating','Damp Specialist'],
  'Carpenter/Joiner':       ['Plasterer'],
  'Kitchen Fitter':         ['Electrician','Plumber/Heating','Plasterer'],
  'Bathroom Fitter':        ['Electrician','Plumber/Heating','Plasterer'],
  'Windows/Doors':          ['Builder/Groundworks'],
  'Painter/Decorator':      ['Plasterer','Carpenter/Joiner'],
  'Flooring':               ['Plasterer','Painter/Decorator'],
  'Fire Safety/Alarms':     ['Electrician','Painter/Decorator'],
  'Snagging':               ['Flooring','Fire Safety/Alarms'],
  'Cleaning/Clearance':     ['Snagging'],
};

// Pre-quote info checklist per trade
const TRADE_INFO_NEEDED = {
  'Electrician':['Property size (m²)','Number of sockets required','Consumer unit location','Access arrangements','Occupied or vacant','Floor access required','EICR certificate required','EV charger needed','External lighting required','Smoke/CO alarm installation'],
  'Plumber/Heating':['Number of radiators','Boiler location and type','Gas supply confirmed','Hot water demand (combi/system)','Number of bathrooms/ensuites','Underfloor heating required','Outside tap required','Landlord gas safety cert needed'],
  'Plasterer':['Rooms to plaster (list each)','Wall condition (skimming/full re-plaster)','Ceiling condition','Damp areas present','Dot-and-dab or boarding required','Archways or curved surfaces','Areas with tiles to remove first'],
  'Painter/Decorator':['Number of rooms','Prep level required (fill/sand/prime)','Paint supplied by client or contractor','External painting required','Specialist finishes','Ceiling heights','Woodwork included'],
  'Damp Specialist':['Affected walls (linear metres)','Survey report available','Photos of damp areas','Source of moisture identified','Previous damp treatment','Cellar/basement involved'],
  'Roofer':['Photos of roof','Access arrangements','Scaffolding needed','Leak source identified','Gutter/fascia/eaves condition','Flat or pitched roof','Chimney present','Valley or hips condition'],
  'Kitchen Fitter':['Current kitchen layout/dimensions','Supply source (client/contractor)','Tiling included','Plumbing included','Electrical included','Appliances included','Worktop type','Flooring included'],
  'Bathroom Fitter':['Current bathroom dimensions','Suite supply source','Tiling included','Plumbing included','Electrical included','Underfloor heating','En-suite required','Wet room or shower enclosure'],
  'Flooring':['Floor types required (carpet/vinyl/LVT/tiles)','Total area (m²) per room','Subfloor condition','Stair runner required','Underlay included','Existing floor removal needed'],
  'Scaffolding':['Photos of access requirement','Duration of scaffolding hire','Traffic management required','Neighbour permissions needed','Insurance cert required'],
  'Damp Specialist':['Affected walls linear metres','Source of dampness','Photos','Survey report','Rising or penetrating damp','Chemical DPC required'],
  'Structural Engineer':['Drawing/sketch of proposed works','Current wall/beam details','Photos of structural issue','Building control submission required','Engineer cert needed'],
};

// Empty quote form template
const EMPTY_QUOTE_FORM = {
  propertyId:'', tradeCategory:'', companyId:'', contactId:'',
  quoteRef:'', quoteDate: new Date().toISOString().split('T')[0], expiryDate:'',
  status:'received', pricingMethod:'fixed',
  lineItems:[],
  totalAmount:'', labourAmount:'', materialsAmount:'',
  vatRate:'20', vatAmount:'',
  dayRate:'', pricePerM2:'', pricePerRoom:'', pricePerItem:'', pricePerSocket:'', pricePerRadiator:'', pricePerLinearM:'',
  scopeOfWorks:'', included:'', excluded:'', requiredInfo:'',
  startAvailability:'', leadTimeWeeks:'', noticeDays:'', estimatedDurationWeeks:'', crewSize:'', location:'',
  dependencies:[],
  paymentTerms:'', warranty:'', insuranceChecked:false,
  certifications:[], notes:'',
  rating:{ priceLevel:0, reliability:0, quality:0, quoteSpeed:0, communication:0, availability:0, flipExperience:0, wouldUseAgain:true, overallRating:0 },
};

// ============================================================
// SPEC BUILDER — CONSTANTS
// ============================================================
const SPEC_CATEGORIES = [
  'Bathroom','Kitchen','Flooring','Carpet','Curtains & Blinds',
  'Doors','Skirting & Architrave','Paint & Decorating','Tiles',
  'Lighting','Sockets & Switches','Appliances','Ironmongery',
  'Radiators','Heating Materials','Plumbing Materials',
  'Electrical Materials','External Materials','Garden & Outdoor',
  'Cleaning & Staging','Other',
];
const SPEC_ITEM_STATUSES = ['needed','researching','priced','selected','ordered','delivered','installed','returned','refunded','cancelled'];
const SPEC_STATUS_COLORS = {
  needed:      { bg:'#fef3c7', color:'#92400e' },
  researching: { bg:'#eff6ff', color:'#1d4ed8' },
  priced:      { bg:'#f5f3ff', color:'#6d28d9' },
  selected:    { bg:'#dcfce7', color:'#166534' },
  ordered:     { bg:'#dbeafe', color:'#1e40af' },
  delivered:   { bg:'#ccfbf1', color:'#0f766e' },
  installed:   { bg:'#e0e7ff', color:'#3730a3' },
  returned:    { bg:'#fee2e2', color:'#991b1b' },
  refunded:    { bg:'#fef9c3', color:'#854d0e' },
  cancelled:   { bg:'#f1f5f9', color:'#475569' },
};
const SPEC_UNIT_TYPES = ['item','pair','set','pack','m²','linear m','litre','roll','sheet','tile','length','door','room'];
const STANDARD_ROOMS = [
  'Kitchen','Living Room','Dining Room','Bathroom','En-suite','Shower Room','WC',
  'Master Bedroom','Bedroom 2','Bedroom 3','Bedroom 4','Bedroom 5',
  'Hallway','Landing','Utility Room','Garage','Garden','External','Other',
];
const SPEC_TRADE_MAP = {
  'Bathroom':'Bathroom Fitter','Kitchen':'Kitchen Fitter','Flooring':'Flooring','Carpet':'Flooring',
  'Tiles':'Tiler','Electrical Materials':'Electrician','Plumbing Materials':'Plumber/Heating',
  'Heating Materials':'Plumber/Heating','Radiators':'Plumber/Heating','Lighting':'Electrician',
  'Sockets & Switches':'Electrician','Paint & Decorating':'Painter/Decorator',
  'Doors':'Carpenter/Joiner','Skirting & Architrave':'Carpenter/Joiner','Ironmongery':'Carpenter/Joiner',
  'External Materials':'Builder/Groundworks','Garden & Outdoor':'Landscaping',
};
const EMPTY_SPEC_ITEM = {
  propertyId:'', room:'', category:'', tradeAssociation:'',
  name:'', supplier:'', productUrl:'', sku:'', brand:'', description:'', imageUrl:'',
  quantity:'1', unit:'item', unitPrice:'', totalPrice:'',
  vatRate:'20', vatAmount:'', deliveryCost:'',
  leadTimeWeeks:'', availability:'', warranty:'', returnStatus:'',
  purchaseStatus:'needed', installationStatus:'',
  linkedQuoteId:'', comparisonGroupId:'',
  isSelected:true, qualityLevel:'', selectionReason:'', isRequired:true, notes:'',
};
const EMPTY_SPEC_TEMPLATE = { name:'', category:'', description:'', items:[] };

// ============================================================
// TASKS — CONSTANTS
// ============================================================
const TASK_STATUSES = [
  { value:'not_started', label:'Not started', color:'#475569', bg:'#f1f5f9' },
  { value:'in_progress',  label:'In progress',  color:'#185fa5', bg:'#e6f1fb' },
  { value:'waiting',      label:'Waiting',      color:'#92400e', bg:'#fef3c7' },
  { value:'blocked',      label:'Blocked',      color:'#991b1b', bg:'#fee2e2' },
  { value:'follow_up',    label:'Follow-up',    color:'#6b21a8', bg:'#f3e8ff' },
  { value:'done',         label:'Done',         color:'#166534', bg:'#dcfce7' },
];
const TASK_STATUS_MAP = Object.fromEntries(TASK_STATUSES.map(s => [s.value, s]));
const WAITING_ON_OPTIONS = ['Builder','Solicitor','Auction house','Surveyor','Mortgage broker','Estate agent','Partner','Seller','Other'];
const DEFAULT_TASK_TEMPLATES = [
  { id:'tpl_auction', name:'Auction review', description:'Pre-auction due diligence checklist', items:[
    { id:1, title:'Download & read legal pack', priority:'High', dayOffset:-14 },
    { id:2, title:'Run property intelligence report', priority:'High', dayOffset:-14 },
    { id:3, title:'Check flood & planning risk', priority:'High', dayOffset:-12 },
    { id:4, title:'Verify title type (freehold/leasehold)', priority:'High', dayOffset:-12 },
    { id:5, title:'Book & attend viewing', priority:'High', dayOffset:-10 },
    { id:6, title:'Estimate refurb costs', priority:'High', dayOffset:-7 },
    { id:7, title:'Run comparables analysis', priority:'Medium', dayOffset:-7 },
    { id:8, title:'Calculate max bid & GDV', priority:'High', dayOffset:-5 },
    { id:9, title:'Confirm go / no-go decision', priority:'High', dayOffset:-3 },
    { id:10, title:'Arrange proof of funds', priority:'Medium', dayOffset:-3 },
    { id:11, title:'Attend auction', priority:'High', dayOffset:0 },
  ]},
  { id:'tpl_purchase', name:'Purchase completion', description:'Post-auction purchase & legal tasks', items:[
    { id:1, title:'Instruct solicitor', priority:'High', dayOffset:1 },
    { id:2, title:'Pay auction deposit (10%)', priority:'High', dayOffset:1 },
    { id:3, title:'Provide proof of funds to solicitor', priority:'High', dayOffset:2 },
    { id:4, title:'Review & sign contracts', priority:'High', dayOffset:7 },
    { id:5, title:'Arrange buildings insurance', priority:'High', dayOffset:14 },
    { id:6, title:'Chase title report', priority:'Medium', dayOffset:14, waitingOn:'Solicitor' },
    { id:7, title:'Pay SDLT', priority:'High', dayOffset:20 },
    { id:8, title:'Confirm completion date with solicitor', priority:'Medium', dayOffset:21, waitingOn:'Solicitor' },
  ]},
  { id:'tpl_refurb', name:'Refurb project', description:'Refurbishment management tasks', items:[
    { id:1, title:'Get 3 builder quotes', priority:'High', dayOffset:1 },
    { id:2, title:'Agree scope of works with builder', priority:'High', dayOffset:7 },
    { id:3, title:'Sign builder contract', priority:'High', dayOffset:10 },
    { id:4, title:'Apply for building regs if required', priority:'Medium', dayOffset:10 },
    { id:5, title:'Order fitted kitchen & bathrooms', priority:'High', dayOffset:7 },
    { id:6, title:'Weekly site visits', priority:'Medium', dayOffset:14 },
    { id:7, title:'Snagging inspection', priority:'High', dayOffset:60 },
    { id:8, title:'Professional photography', priority:'Medium', dayOffset:70 },
    { id:9, title:'Instruct estate agent for sale/let', priority:'High', dayOffset:70 },
    { id:10, title:'EPC renewal', priority:'Medium', dayOffset:65 },
  ]},
];

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
  const [settingsProfile, setSettingsProfile] = useState({ name: user.name || '', email: user.email || '', company: localStorage.getItem('crm_profile_company') || 'A&A Partners' });
  const [settingsMapsKey] = useState(import.meta.env.VITE_GOOGLE_MAPS_KEY || '');
  const [settingsTheme, setSettingsTheme] = useState({ accentColor: '#059669', sidebarColor: '#0f172a' });
  const [settingsNotifications, setSettingsNotifications] = useState({ newProperty: true, auctionCountdown: true, countdownDays: [7, 3, 1], noteAdded: true, newUser: true, newContact: false, newCompany: false });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [allUserNotifSettings, setAllUserNotifSettings] = useState(null);
  const [allUserNotifLoading, setAllUserNotifLoading] = useState(false);
  const [userNotifSaving, setUserNotifSaving] = useState({});
  const [userNotifSaved, setUserNotifSaved] = useState({});
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsSaveError, setSettingsSaveError] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Change password state
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwStatus, setPwStatus] = useState(null); // { type: 'success'|'error', message }
  const [pwSaving, setPwSaving] = useState(false);

  const handleSaveSettings = async () => {
    setSettingsSaving(true);
    setSettingsSaveError('');
    localStorage.setItem('crm_profile_company', settingsProfile.company || '');
    const token = localStorage.getItem('crm_session');
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: settingsProfile.name }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('crm_user', JSON.stringify(data.user));
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2500);
      } else {
        setSettingsSaveError(data.message || 'Failed to save profile.');
      }
    } catch {
      setSettingsSaveError('Network error — please try again.');
    }
    setSettingsSaving(false);
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
    const data = { properties, companies, contacts, globalNotes, refurbQuotes };
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
    { key: 'scraper', label: 'Auction Triage' },
    { key: 'surveyors', label: 'Surveyor Intel' },
    { key: 'auctionintel', label: 'Auction Intel' },
    { key: 'dealanalysis', label: 'Deal Analysis' },
    { key: 'portfolio', label: 'Portfolio' },
    { key: 'companies', label: 'Companies Directory' },
    { key: 'contacts', label: 'Contacts Roster' },
    { key: 'tasks', label: 'Tasks & Follow-ups' },
    { key: 'refurb', label: 'Refurb Quotes' },
    { key: 'spec', label: 'Spec Builder' },
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
  const [editingKpi, setEditingKpi] = useState(false);
  const [propCanvasTab, setPropCanvasTab] = useState('overview');
  const [propMapOpen, setPropMapOpen] = useState(false);
  const openPropertyView = (p) => { setCurrentViewProperty(p); setPropCanvasTab('overview'); setPropMapOpen(false); };

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

  // Companies extended filters
  const [companySort, setCompanySort] = useState('newest');
  const [companySearchCity, setCompanySearchCity] = useState('ALL');
  const [companySearchTier, setCompanySearchTier] = useState('ALL');
  const [companyHasContacts, setCompanyHasContacts] = useState('ANY');
  const [companyHasProperties, setCompanyHasProperties] = useState('ANY');
  const [companyPropCount, setCompanyPropCount] = useState('ANY');
  const [companyLastActivity, setCompanyLastActivity] = useState('ANY');
  const [companyDateAdded, setCompanyDateAdded] = useState('ANY');
  const [companyShowMoreFilters, setCompanyShowMoreFilters] = useState(false);
  const [companyQuickKeyRel, setCompanyQuickKeyRel] = useState(false);
  const [companyQuickInactive, setCompanyQuickInactive] = useState(false);
  const [companyQuickOpenProps, setCompanyQuickOpenProps] = useState(false);

  // Contacts extended filters
  const [contactSort, setContactSort] = useState('newest');
  const [contactSearchRole, setContactSearchRole] = useState('ALL');
  const [contactSearchCompany, setContactSearchCompany] = useState('ALL');
  const [contactSearchCoType, setContactSearchCoType] = useState('ALL');
  const [contactHasNotes, setContactHasNotes] = useState('ANY');
  const [contactLastActivity, setContactLastActivity] = useState('ANY');
  const [contactDateAdded, setContactDateAdded] = useState('ANY');
  const [contactSearchOrigin, setContactSearchOrigin] = useState('ALL');
  const [contactShowMoreFilters, setContactShowMoreFilters] = useState(false);
  const [contactQuickActiveMonth, setContactQuickActiveMonth] = useState(false);
  const [newConNote, setNewConNote] = useState('');

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
  // AUCTION CONTROL CENTRE STATE
  // ==========================================
  const [auctionDates, setAuctionDates] = useState([]);
  const [auctionLots, setAuctionLots] = useState([]);
  const [auctionSelectedDateId, setAuctionSelectedDateId] = useState(null);
  const [auctionLotFilter, setAuctionLotFilter] = useState({ status: 'all', type: 'all', search: '' });
  const [auctionSelectedLotIds, setAuctionSelectedLotIds] = useState(new Set());
  const [auctionTabLoading, setAuctionTabLoading] = useState(false);

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
  const _pf = (() => { try { return JSON.parse(localStorage.getItem('crm_pipeline_filters') || '{}'); } catch { return {}; } })();
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
    setCompanies([{ id: Date.now(), name: newCompName, website: newCompWeb || '--', type: newCompType, city: newCompCity || '--', phone: newCompPhone || '', buyersPremium: newCompPremium || '', adminFee: newCompAdminFee || '', owner: 'Ashley Austin-Buah', createdDate: new Date().toISOString().split('T')[0], costItems: [] }, ...companies]);
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
  const runPropertyIntelligence = async (prop, opts = {}) => {
    const { silent = false } = opts;
    const postcode = (prop.postcode || extractPostcode(prop.address || '')).trim().toUpperCase();
    const lat = prop.lat || null;
    const lng = prop.lng || null;
    if (!postcode && !lat) {
      if (!silent) alert('This property needs a postcode or address with postcode to run intelligence.\n\nEdit the address to include a postcode (e.g. S2 4AA) then try again.');
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
      if (!data.success) { if (!silent) alert(data.message || 'Intelligence run failed.'); return; }

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
      setProperties(prev => prev.map(p => p.id === updatedProp.id ? updatedProp : p));
      if (!silent || currentViewProperty?.id === updatedProp.id) setCurrentViewProperty(updatedProp);
    } catch {
      if (!silent) alert('Intelligence run failed — please check your connection.');
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
      // AI / risk summary
      'aiSummary', 'redFlags',
    ];
    for (const f of reportFields) {
      if (analytics[f] != null) merged[f] = analytics[f];
    }

    // Apply address/postcode from report if not already set
    const extraUpdates = {};
    // Guide price and max bid live on the property directly — always override with report values
    if (analytics.guidePrice) extraUpdates.guidePrice = analytics.guidePrice;
    if (analytics.maxBid) extraUpdates.maxBid = analytics.maxBid;
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
    const newId = Date.now();
    setContacts([{ id: newId, name: newConName, email: newConEmail, jobTitle: newConTitle || '', phone: newConPhone || '', officePhone: '', linkedin: '', companyId: parseInt(newConCompanyId) || null, role: newConRole || 'Other', origin: newConOrigin || '', owner: 'Ashley Austin-Buah', lastActivity: new Date().toISOString().split('T')[0] }, ...contacts]);
    if (newConNote.trim()) {
      setGlobalNotes([{ id: newId + 1, targetType: 'Contact', targetId: newId, text: newConNote, type: 'Review', author: noteAuthor, date: new Date().toISOString().split('T')[0], bookmarked: false, done: false }, ...globalNotes]);
    }
    setNewConName(''); setNewConEmail(''); setNewConTitle(''); setNewConPhone(''); setNewConRole(''); setNewConNote('');
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
      runStageAutomation(currentViewProperty, normaliseStatus(value));
    }
    setCurrentViewProperty(updated);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updated : p));
  };

  // Record an auction result: sets the Won/Lost stage and the bidOutcome detail
  // (outbid vs no-bid vs withdrawn) in one update
  const setPropertyOutcome = (result) => {
    if (!currentViewProperty) return;
    const status = result === 'won' ? 'Won' : 'Lost';
    const resultLabel = { won: 'Won', outbid: 'Lost (outbid)', no_bid: 'No bid placed', withdrawn: 'Withdrawn' }[result] || result;
    let updated = {
      ...currentViewProperty,
      status,
      bidOutcome: { ...(currentViewProperty.bidOutcome || {}), result, recordedAt: new Date().toISOString() },
    };
    updated = withActivity(updated, 'stage', `Auction result recorded: ${resultLabel}`);
    runStageAutomation(currentViewProperty, status);
    setCurrentViewProperty(updated);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updated : p));
  };

  // Stage-change automation: posts to the alert feed and auto-creates the
  // matching task template (Won → purchase checklist, Refurb → refurb project)
  // unless that template was already applied to the property.
  const STAGE_TASK_TEMPLATES = { 'Won': 'tpl_purchase', 'Refurb': 'tpl_refurb' };
  const runStageAutomation = (prop, newStatus) => {
    if (!prop || normaliseStatus(prop.status) === newStatus) return;
    const propName = prop.dealName || prop.address?.split(',')[0] || 'Property';
    postAlert({ type: 'stage_change', title: `${propName} → ${newStatus}`, body: `Moved from ${normaliseStatus(prop.status)} by ${user.name || 'a user'}`, targetType: 'property', targetId: prop.id });
    const tplId = STAGE_TASK_TEMPLATES[newStatus];
    if (!tplId) return;
    if (tasks.some(t => t.templateId === tplId && t.linkedId === prop.id)) return;
    const tpl = [...DEFAULT_TASK_TEMPLATES, ...taskTemplates].find(t => t.id === tplId);
    if (!tpl) return;
    const todayStr = new Date().toISOString().split('T')[0];
    const newTasks = tpl.items.map(item => {
      const due = new Date();
      due.setDate(due.getDate() + (item.dayOffset || 0));
      return {
        id: Date.now() + Math.random(), title: item.title,
        dueDate: due.toISOString().split('T')[0], priority: item.priority || 'Medium',
        status: 'not_started', linkedType: 'Property',
        linkedId: prop.id, linkedName: propName,
        notes: '', assignee: user.name || 'Ashley', createdDate: todayStr,
        createdBy: 'Automation', waitingOn: item.waitingOn || '',
        templateId: tpl.id, subtasks: [], comments: [], reminders: [],
        activityLog: [{ id: Date.now() + Math.random(), type: 'created', detail: `Auto-created on stage change to ${newStatus} (template: ${tpl.name})`, user: 'Automation', at: new Date().toISOString() }],
      };
    });
    setTasks(prev => [...prev, ...newTasks]);
    postAlert({ type: 'task_autocreated', title: `${newTasks.length} tasks queued for ${propName}`, body: `"${tpl.name}" template applied automatically on move to ${newStatus}`, targetType: 'property', targetId: prop.id });
  };

  // Record a real observed price into the trade price book. Each sample refines
  // the low/typical/high range for that job type, so quoting gets faster over time.
  const addPriceBookSample = (trade, jobType, price, { unit = 'job', companyId = null, quoteId = null } = {}) => {
    const p = parseFloat(price);
    if (!trade || !jobType || !p) return false;
    const norm = (s) => (s || '').trim().toLowerCase();
    setCatalogTrades(prev => {
      const idx = prev.findIndex(e => norm(e.trade) === norm(trade) && norm(e.jobType) === norm(jobType));
      const sample = { price: p, companyId, quoteId, date: new Date().toISOString().split('T')[0] };
      if (idx === -1) {
        return [...prev, { id: Date.now(), trade, jobType: jobType.trim(), unit, lowPrice: p, typicalPrice: p, highPrice: p, preferredCompanyId: null, alternateCompanyIds: [], notes: '', samples: [sample], createdAt: new Date().toISOString().split('T')[0] }];
      }
      const entry = prev[idx];
      const samples = [...(entry.samples || []), sample];
      const prices = samples.map(s => s.price).sort((a, b) => a - b);
      const median = prices[Math.floor(prices.length / 2)];
      return prev.map((e, i) => i === idx ? { ...e, samples, lowPrice: prices[0], highPrice: prices[prices.length - 1], typicalPrice: median } : e);
    });
    return true;
  };

  const updateCompanyField = (field, value) => {
    if (!currentViewCompany) return;
    const updated = { ...currentViewCompany, [field]: value };
    setCurrentViewCompany(updated);
    setCompanies(companies.map(c => c.id === currentViewCompany.id ? updated : c));
  };

  const togglePropertyCompanyLink = (propertyId, companyId, link) => {
    setProperties(prev => prev.map(p => {
      if (p.id !== propertyId) return p;
      const current = p.linkedCompanyIds || [];
      const next = link ? [...new Set([...current, companyId])] : current.filter(id => id !== companyId);
      return { ...p, linkedCompanyIds: next };
    }));
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

    a.maxBid = n(/<label>Max (?:Safe )?Bid[^<]*<\/label>\s*<div class="value[^"]*">(£[\d,]+)/i)
      || n(/class="[^"]*max[-_]?bid[^"]*"[^>]*>(£[\d,]+)/i)
      || n(/Max(?:imum)?\s+(?:Safe\s+)?Bid[^£\d<]{0,30}(£[\d,]+)/i);
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

    a.epcRating = $(/class="epc-chip epc-([A-G])"/i)
      || $(/class="[^"]*epc[-_]badge[^"]*"[^>]*>\s*([A-G])\s*</i)
      || $(/EPC\s+Rating[^A-G<]{0,30}([A-G])\b/i)
      || $(/Energy\s+(?:Performance|Efficiency)[^A-G<]{0,60}([A-G])\b/i);
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

    // GDV fallback patterns for reports where label-sm regex didn't match
    if (!a.gdvConservative) a.gdvConservative = n(/Conservative\s+GDV[^£\d<]{0,40}(£[\d,]+)/i) || n(/Lender\s+Floor[^£\d<]{0,40}(£[\d,]+)/i);
    if (!a.gdvBase)         a.gdvBase         = n(/Base\s+(?:Case\s+)?GDV[^£\d<]{0,40}(£[\d,]+)/i);
    if (!a.gdvOptimistic)   a.gdvOptimistic   = n(/Optimistic\s+GDV[^£\d<]{0,40}(£[\d,]+)/i) || n(/Best\s+Case\s+GDV[^£\d<]{0,40}(£[\d,]+)/i);
    // Reversed-order labels: "GDV — Conservative", "GDV — Base", "GDV — Optimistic" (value in a following tag)
    if (!a.gdvConservative) a.gdvConservative = n(/GDV\s*[—–-]\s*Conservative[\s\S]{0,80}?(£[\d,]+)/i);
    if (!a.gdvBase)         a.gdvBase         = n(/GDV\s*[—–-]\s*Base[\s\S]{0,80}?(£[\d,]+)/i);
    if (!a.gdvOptimistic)   a.gdvOptimistic   = n(/GDV\s*[—–-]\s*Optimistic[\s\S]{0,80}?(£[\d,]+)/i);

    // Aliases so display code works regardless of which key it reads
    a.conservativeGDV = a.gdvConservative;
    a.maxGDV = a.gdvOptimistic;
    if (a.margin != null) a.profitMargin = a.margin;  // display reads profitMargin

    // AI deal summary — prefer the "Where it stands" reason list under the Deal Verdict
    let summaryText = '';
    const wisM = htmlText.match(/Where\s+it\s+stands[\s\S]{0,120}?<(?:ul|ol)[^>]*>([\s\S]*?)<\/(?:ul|ol)>/i);
    if (wisM) {
      const items = [...wisM[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
        .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
        .filter(t => t.length > 5);
      if (items.length) summaryText = items.join(' · ');
    }
    if (!summaryText) {
      const summaryRaw = $(/Where\s+it\s+stands[^<]*<\/[^>]+>\s*<[^>]+>([\s\S]{50,1200}?)<\/(?:p|div|section)/i)
        || $(/class="[^"]*deal[-_]?summ[^"]*"[^>]*>([\s\S]{50,600}?)<\/(?:div|section|p)/i)
        || $(/class="[^"]*verdict[-_]?summ[^"]*"[^>]*>([\s\S]{50,600}?)<\/(?:div|section|p)/i)
        || $(/class="[^"]*legal[-_]?pack[-_]?summ[^"]*"[^>]*>([\s\S]{50,600}?)<\/(?:div|section|p)/i)
        || $(/class="insight-box"[^>]*>\s*<p[^>]*>([\s\S]{50,700}?)<\/p>/i);
      if (summaryRaw) summaryText = summaryRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
    if (summaryText) a.aiSummary = summaryText.substring(0, 800);

    // Red flags — try flag-title cards first (Deal Analyser format), then <ul>, then generic block
    const flagTitles = [...htmlText.matchAll(/class="flag-title"[^>]*>([\s\S]*?)<\/div>/gi)]
      .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').replace(/^[⚠️\s·–—-]+/, '').trim())
      .filter(t => t.length > 3);
    if (flagTitles.length) {
      a.redFlags = flagTitles;
    } else {
      const rfSection = htmlText.match(/Red\s+Flags?[\s\S]{0,200}?<(?:ul|ol)[^>]*>([\s\S]{0,3000}?)<\/(?:ul|ol)>/i);
      if (rfSection) {
        const flagItems = [...rfSection[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
          .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 3);
        if (flagItems.length) a.redFlags = flagItems;
      } else {
        const rfBlock = htmlText.match(/class="[^"]*red[-_]?flag[^"]*"[^>]*>([\s\S]{0,2000}?)<\/(?:div|section)/i);
        if (rfBlock) {
          const items = [...rfBlock[1].matchAll(/<(?:li|p|div)[^>]*>([^<]{10,200})/gi)]
            .map(m => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (items.length) a.redFlags = items;
        }
      }
    }

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
        body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes }),
      }).then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); })
        .catch(() => setSaveStatus('idle'));

    } catch {
      alert('Document upload failed — please check your connection and try again.');
    }
  };

  const handleCustomDocUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentViewProperty) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const token = localStorage.getItem('crm_session');
    const fileKey = `custom_${Date.now()}`;
    const fd = new FormData();
    fd.append('file', file);
    fd.append('propertyId', String(currentViewProperty.id));
    fd.append('fileKey', fileKey);
    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
      const data = await res.json();
      if (!data.success) throw new Error('Upload rejected');
      const docRecord = { id: Date.now(), name: file.name, type: ext, key: data.key, uploadedAt: new Date().toISOString() };
      const updatedProp = withActivity(
        { ...currentViewProperty, customDocs: [...(currentViewProperty.customDocs || []), docRecord] },
        'document',
        `Document added: ${file.name}`,
      );
      setCurrentViewProperty(updatedProp);
      const updatedProperties = properties.map(p => p.id === currentViewProperty.id ? updatedProp : p);
      setProperties(updatedProperties);
      setSaveStatus('saving');
      fetch('/api/crm-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes }),
      }).then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); })
        .catch(() => setSaveStatus('idle'));
    } catch {
      alert('Document upload failed — please check your connection and try again.');
    }
  };

  const handleRemoveCustomDoc = (docId) => {
    if (!currentViewProperty) return;
    const updatedProp = { ...currentViewProperty, customDocs: (currentViewProperty.customDocs || []).filter(d => d.id !== docId) };
    setCurrentViewProperty(updatedProp);
    setProperties(properties.map(p => p.id === currentViewProperty.id ? updatedProp : p));
  };

  const handleDeleteReportFile = (fileKey, label) => {
    if (!currentViewProperty) return;
    if (!window.confirm(`Remove "${label}"? Re-upload the file to re-parse it. Existing extracted figures stay until overwritten.`)) return;
    const updatedFiles = { ...(currentViewProperty.files || {}) };
    delete updatedFiles[fileKey];
    const updatedProp = withActivity({ ...currentViewProperty, files: updatedFiles }, 'document', `Document removed: ${label}`);
    setCurrentViewProperty(updatedProp);
    const updatedProperties = properties.map(p => p.id === currentViewProperty.id ? updatedProp : p);
    setProperties(updatedProperties);
    const token = localStorage.getItem('crm_session');
    fetch('/api/crm-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }) }).catch(() => {});
  };

  const handleReparseReport = async () => {
    if (!currentViewProperty) return;
    const rec = currentViewProperty.files?.mainReport;
    if (!rec?.key) { alert('No stored assessment report to re-parse. Upload the HTML report first.'); return; }
    if (rec.type !== 'html') { alert(`Re-parse only works on HTML reports — this file is a ${rec.type || 'PDF'}. Upload the .html version of the report to extract AI summary, red flags and GDV scenarios.`); return; }
    try {
      const token = localStorage.getItem('crm_session');
      const res = await fetch(`/api/documents/${rec.key}`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      const analytics = parseReportAnalytics(text);
      if (!analytics) { alert('Re-parse ran but found no analytics in this report. Its HTML structure may not match the parser — send me the report and I can tune the patterns.'); return; }
      const updatedProp = applyReportToProperty(currentViewProperty, analytics, rec, 'mainReport');
      setCurrentViewProperty(updatedProp);
      const updatedProperties = properties.map(p => p.id === currentViewProperty.id ? updatedProp : p);
      setProperties(updatedProperties);
      setSaveStatus('saving');
      fetch('/api/crm-data', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks }) })
        .then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); }).catch(() => setSaveStatus('idle'));
      const got = [];
      if (analytics.aiSummary) got.push('AI summary');
      if (analytics.redFlags?.length) got.push(`${analytics.redFlags.length} red flags`);
      if (analytics.gdvConservative || analytics.gdvBase || analytics.gdvOptimistic) got.push('GDV scenarios');
      if (analytics.matrixBase || analytics.matrixConservative || analytics.matrixOptimistic) got.push('profit matrix');
      if (analytics.maxBid) got.push('max bid');
      if (analytics.netProfit) got.push('net profit');
      const missing = [];
      if (!analytics.aiSummary) missing.push('AI summary');
      if (!analytics.redFlags?.length) missing.push('red flags');
      if (!(analytics.gdvConservative || analytics.gdvBase || analytics.gdvOptimistic)) missing.push('GDV scenarios');
      alert(`Re-parsed "${rec.name}".\n\nFound: ${got.join(', ') || 'basic figures only'}.${missing.length ? `\n\nNOT detected: ${missing.join(', ')} — these sections weren't found in the report HTML. If the report does contain them, send it to me and I'll adjust the parser.` : ''}`);
    } catch {
      alert('Could not re-parse — the file may have been uploaded in a previous session and is no longer retrievable from storage. Re-upload the HTML report.');
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

  const loadAuctionData = async () => {
    setAuctionTabLoading(true);
    try {
      const token = localStorage.getItem('crm_session');
      const h = { 'Authorization': `Bearer ${token}` };
      const [dRes, lRes] = await Promise.all([
        fetch('/api/auction/dates', { headers: h }),
        fetch('/api/auction/lots', { headers: h }),
      ]);
      const [dData, lData] = await Promise.all([dRes.json(), lRes.json()]);
      const dates = dData.dates || [];
      let lots = lData.lots || [];

      // One-time import: legacy watchlist items become manual leads in the unified
      // triage queue. Deterministic ids make this idempotent (server ignores dupes).
      if (watchlist.length > 0) {
        const importLots = watchlist.map(w => ({
          id: `manual-wl-${w.id}`,
          origin: 'manual',
          dateId: null,
          address: w.address,
          houseName: w.auctionHouse || w.platform || '',
          guidePrice: w.guidePrice || 0,
          previousGuidePrice: w.guidePrev || null,
          auctionDate: w.auctionDate || '',
          notes: w.notes || '',
          status: 'watching',
          watchlistItem: w,
        }));
        await fetch('/api/auction/lots', { method: 'POST', headers: { ...h, 'Content-Type': 'application/json' }, body: JSON.stringify(importLots) });
        setWatchlist([]);
        const reRes = await fetch('/api/auction/lots', { headers: h });
        lots = (await reRes.json()).lots || lots;
      }

      setAuctionDates(dates);
      setAuctionLots(lots);
      setAuctionSelectedDateId(prev => prev || (dates.length > 0 ? dates[0].id : 'manual'));
    } catch (e) { console.error('Failed to load auction data', e); }
    setAuctionTabLoading(false);
  };

  const addManualLead = async ({ address, house, guidePrice, auctionDate, notes, url }) => {
    const lead = {
      id: `manual-${Date.now()}`,
      origin: 'manual',
      dateId: null,
      address,
      houseName: house || '',
      guidePrice: parseFloat(guidePrice) || 0,
      auctionDate: auctionDate || '',
      notes: notes || '',
      lotUrl: url || '',
      status: 'unreviewed',
      addedDate: new Date().toISOString().split('T')[0],
    };
    setAuctionLots(prev => [...prev, lead]);
    try {
      const token = localStorage.getItem('crm_session');
      await fetch('/api/auction/lots', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
    } catch (e) { console.error('Manual lead persist failed', e); }
  };

  const triageLot = async (lotId, newStatus) => {
    setAuctionLots(prev => prev.map(l => l.id === lotId ? { ...l, status: newStatus, isNew: false, lastUpdatedAt: new Date().toISOString() } : l));
    try {
      const token = localStorage.getItem('crm_session');
      await fetch(`/api/auction/lots/${encodeURIComponent(lotId)}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, isNew: false }),
      });
      // Refresh date counts
      const dRes = await fetch('/api/auction/dates', { headers: { 'Authorization': `Bearer ${token}` } });
      const dData = await dRes.json();
      setAuctionDates(dData.dates || []);
    } catch (e) { console.error('Triage persist failed', e); }
  };

  const triageBulk = async (ids, newStatus) => {
    setAuctionLots(prev => prev.map(l => ids.has(l.id) ? { ...l, status: newStatus, isNew: false, lastUpdatedAt: new Date().toISOString() } : l));
    setAuctionSelectedLotIds(new Set());
    try {
      const token = localStorage.getItem('crm_session');
      await Promise.all([...ids].map(id => fetch(`/api/auction/lots/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: newStatus, isNew: false }) })));
      const dRes = await fetch('/api/auction/dates', { headers: { 'Authorization': `Bearer ${token}` } });
      const dData = await dRes.json();
      setAuctionDates(dData.dates || []);
    } catch (e) { console.error('Bulk triage persist failed', e); }
  };

  const sendLotToPipeline = (lot) => {
    setProperties(prev => [...prev, {
      id: Date.now(), address: lot.address, guidePrice: lot.guidePrice || 0, auctionDate: lot.auctionDate, auctionTime: '12:00', maxBid: 0, refurb: 0, bedrooms: lot.bedrooms || 0, propertyType: lot.propertyType || 'Unknown', sourcePlatform: lot.houseName || 'Auction', listingUrl: lot.lotUrl || '', isConsideration: false, isStrongBid: false, planningToBid: true, surveyorStatus: 'called', surveyorDate: '', checklist: { legalReviewed: false, financeApproved: false, costsPriced: false }, notesList: [], files: { mainReport: null, spriftReport: null, surveyFile: null, legalPack: null }, status: 'Sourced', hammerPrice: null, outcome: '',
      // provenance back to the triage lead this property came from
      sourceLotId: lot.id, sourceOrigin: lot.origin || 'scraped', dataSource: 'auction_triage',
      activityLog: [{ id: Date.now() + Math.random(), type: 'created', detail: `Promoted from auction triage (${lot.origin === 'manual' ? 'manual lead' : lot.houseName || 'scraped lot'})`, user: user.name || 'You', at: new Date().toISOString() }],
    }]);
    triageLot(lot.id, 'promoted');
    setActiveTab('pipeline');
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
        // Auto-run intelligence in the background if the scraped address has a postcode
        const autoPc = extractPostcode(newPropFromUrl.address || '');
        if (autoPc) runPropertyIntelligence(newPropFromUrl, { silent: true });
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

  // ── Lender-ready deal pack export ──────────────────────────────
  // Builds a print-friendly document from the property's data and opens it in a
  // new window; the user prints to PDF from there.
  const exportDealPack = (prop) => {
    if (!prop) return;
    const an = prop.analytics || {};
    const f = (v) => (v != null && v !== '' && !isNaN(parseFloat(v))) ? `£${Number(parseFloat(v)).toLocaleString()}` : '—';
    const pct = (v) => v != null && v !== '' ? `${v}%` : '—';
    const propQuotes = refurbQuotes.filter(q => q.propertyId === prop.id && !['rejected'].includes(q.status));
    const acceptedQuotes = propQuotes.filter(q => ['accepted', 'booked', 'in_progress', 'complete', 'paid'].includes(q.status));
    const refurbTotal = acceptedQuotes.reduce((s, q) => s + (parseFloat(q.totalAmount) || 0), 0);
    const specValue = specItems.filter(i => i.propertyId === String(prop.id) && i.isSelected).reduce((s, i) => s + (parseFloat(i.totalPrice) || (parseFloat(i.unitPrice || 0) * parseFloat(i.quantity || 1))), 0);
    const intel = prop.intelligence?.connectors || {};
    const intelRows = [
      intel.epc?.data?.epcRating && ['EPC rating', `${intel.epc.data.epcRating}${intel.epc.data.potentialRating ? ` (potential ${intel.epc.data.potentialRating})` : ''}`],
      intel.police?.data?.riskLabel && ['Crime risk', `${intel.police.data.riskLabel} — ${intel.police.data.monthlyAverage} incidents/month nearby`],
      intel.flood?.data?.riskNote && ['Flood', intel.flood.data.riskNote],
      intel.planning?.data?.planningNote && ['Planning constraints', intel.planning.data.planningNote],
      intel.imd?.data?.label && ['Deprivation', `${intel.imd.data.label} (decile ${intel.imd.data.decile}/10)`],
      intel.hpi?.data?.avgPrice && ['Area avg price', `£${Number(intel.hpi.data.avgPrice).toLocaleString()} · ${intel.hpi.data.growth1yr != null ? `${intel.hpi.data.growth1yr}% 1yr growth` : ''}`],
      intel.schools?.data?.bestRating && ['Schools', `Best nearby: ${intel.schools.data.bestRating}`],
    ].filter(Boolean);
    const comps = (an.compsList || prop.comparables || []).slice(0, 8);
    const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const row = (l, v) => `<tr><td class="l">${esc(l)}</td><td class="v">${esc(v)}</td></tr>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Deal Pack — ${esc(prop.dealName || prop.address)}</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a202c; margin: 0; padding: 40px 48px; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 2px; } h2 { font-size: 14px; text-transform: uppercase; letter-spacing: .08em; border-bottom: 2px solid #1a202c; padding-bottom: 4px; margin: 28px 0 10px; }
  .sub { color: #4a5568; font-size: 12px; margin-bottom: 4px; }
  .brand { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px double #1a202c; padding-bottom: 12px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; } td, th { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
  td.l { color: #4a5568; width: 42%; } td.v { font-weight: bold; }
  .kpis { display: flex; gap: 12px; margin: 14px 0; } .kpi { flex: 1; border: 1px solid #cbd5e0; padding: 10px 12px; }
  .kpi .n { font-size: 18px; font-weight: bold; } .kpi .t { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #4a5568; }
  .verdict { padding: 10px 14px; border: 2px solid #1a202c; font-weight: bold; margin: 10px 0; }
  .disclaimer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #cbd5e0; font-size: 10px; color: #718096; }
  .noprint { position: fixed; top: 12px; right: 12px; } .noprint button { padding: 10px 18px; font-size: 14px; cursor: pointer; }
  @media print { .noprint { display: none; } body { padding: 0; } }
</style></head><body>
<div class="noprint"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
<div class="brand"><div><h1>Investment Deal Pack</h1><div class="sub">${esc(prop.dealName || prop.address)}</div></div>
<div style="text-align:right"><div style="font-weight:bold">A&amp;A Investment Partners</div><div class="sub">Prepared ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div></div>

<h2>Property</h2><table>
${row('Address', prop.address)}${prop.postcode ? row('Postcode', prop.postcode) : ''}
${row('Type', `${prop.propertyType || '—'}${prop.bedrooms ? ` · ${prop.bedrooms} bed` : ''}`)}
${row('Source', prop.sourcePlatform || '—')}${prop.auctionDate ? row('Auction date', `${prop.auctionDate}${prop.auctionTime ? ` at ${prop.auctionTime}` : ''}`) : ''}
${row('Guide price', f(prop.guidePrice))}${an.epcRating ? row('EPC rating', an.epcRating) : ''}${an.floorArea ? row('Floor area', an.floorArea) : ''}
</table>

${an.verdict ? `<div class="verdict">Assessment verdict: ${esc(an.verdict)}${an.bidStrength ? ` (${esc(an.bidStrength)} bid)` : ''}</div>` : ''}

<h2>Financial summary</h2>
<div class="kpis">
  <div class="kpi"><div class="n">${f(an.maxBid)}</div><div class="t">Max bid</div></div>
  <div class="kpi"><div class="n">${f(an.netProfit)}</div><div class="t">Net profit</div></div>
  <div class="kpi"><div class="n">${pct(an.profitMargin ?? an.margin)}</div><div class="t">Margin</div></div>
  <div class="kpi"><div class="n">${pct(an.roi)}</div><div class="t">ROI</div></div>
</div>
<table>
${row('GDV — conservative', f(an.gdvConservative ?? an.conservativeGDV))}${row('GDV — base case', f(an.gdvBase))}${row('GDV — optimistic', f(an.gdvOptimistic ?? an.maxGDV))}
${row('Target bid', f(an.targetBid))}${row('Stretch bid', f(an.stretchBid))}${row('Walk-away price', f(an.walkAway))}${row('Break-even bid', f(an.breakEvenBid))}
${row('Total investment', f(an.totalInvestment))}${row("Buyer's premium", f(an.buyersPremium))}${row('SDLT', f(an.sdlt))}
${an.acquisitionFeesTotal ? row('Acquisition fees', f(an.acquisitionFeesTotal)) : ''}${an.holdingTotal ? row('Holding costs', f(an.holdingTotal)) : ''}${an.exitTotal ? row('Exit costs', f(an.exitTotal)) : ''}
</table>

<h2>Refurbishment</h2><table>
${row('Estimate — light', f(an.refurbLight))}${row('Estimate — medium', f(an.refurbMedium))}${row('Estimate — heavy', f(an.refurbHeavy))}
${acceptedQuotes.length ? row(`Accepted trade quotes (${acceptedQuotes.length})`, f(refurbTotal)) : ''}
${specValue > 0 ? row('Specification (materials, selected)', f(specValue)) : ''}
</table>
${acceptedQuotes.length ? `<table style="margin-top:8px"><tr><th>Trade</th><th>Vendor</th><th>Amount</th><th>Status</th></tr>${acceptedQuotes.map(q => `<tr><td>${esc(q.tradeCategory)}</td><td>${esc(companies.find(c => c.id === q.companyId)?.name || '—')}</td><td>${f(q.totalAmount)}</td><td>${esc(q.status)}</td></tr>`).join('')}</table>` : ''}

${intelRows.length ? `<h2>Area intelligence</h2><table>${intelRows.map(([l, v]) => row(l, v)).join('')}</table>` : ''}

${comps.length ? `<h2>Comparable sales</h2><table><tr><th>Address</th><th>Sold</th><th>Price</th><th>Notes</th></tr>${comps.map(c => `<tr><td>${esc(c.address)}</td><td>${esc(c.soldDate || c.date || '—')}</td><td>${f(c.soldPrice ?? c.price)}</td><td>${esc(c.notes || c.propertyType || '')}</td></tr>`).join('')}</table>` : ''}

${an.aiSummary ? `<h2>Analyst review</h2><p>${esc(an.aiSummary)}</p>${(an.aiRiskFlags || []).length ? `<div class="sub" style="font-weight:bold;margin-top:6px">Risk flags</div><ul>${an.aiRiskFlags.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}` : ''}

<div class="disclaimer">Prepared by A&amp;A Investment Partners for lending assessment purposes. Figures are estimates derived from the assessment report, public records (HM Land Registry, EPC register, Environment Agency, Police.uk) and quotes received; they do not constitute a formal valuation. E&amp;OE.</div>
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked — allow pop-ups to export the deal pack.'); return; }
    win.document.write(html);
    win.document.close();
  };

  // ── AI deal review — summary, risk flags, deal score ───────────
  const [aiReviewLoadingId, setAiReviewLoadingId] = useState(null);
  const runAiDealReview = async (prop) => {
    if (!prop || aiReviewLoadingId) return;
    setAiReviewLoadingId(prop.id);
    try {
      const token = localStorage.getItem('crm_session');
      const intel = prop.intelligence?.connectors || {};
      const propQuotes = refurbQuotes.filter(q => q.propertyId === prop.id);
      const payload = {
        property: {
          address: prop.address, dealName: prop.dealName, status: prop.status,
          guidePrice: prop.guidePrice, auctionDate: prop.auctionDate,
          propertyType: prop.propertyType, bedrooms: prop.bedrooms,
          analytics: prop.analytics || {},
          intelligenceSummary: {
            crime: intel.police?.data ? { risk: intel.police.data.riskLabel, monthly: intel.police.data.monthlyAverage } : null,
            flood: intel.flood?.data?.riskNote || null,
            planning: intel.planning?.data?.planningNote || null,
            deprivation: intel.imd?.data ? `${intel.imd.data.label} (decile ${intel.imd.data.decile})` : null,
            areaPrices: intel.hpi?.data ? { avg: intel.hpi.data.avgPrice, growth1yr: intel.hpi.data.growth1yr } : null,
            epc: intel.epc?.data ? { rating: intel.epc.data.epcRating, flags: intel.epc.data.energyFlags } : null,
          },
          refurbSummary: {
            quotes: propQuotes.length,
            accepted: propQuotes.filter(q => q.status === 'accepted').map(q => ({ trade: q.tradeCategory, amount: q.totalAmount })),
          },
          comparables: (prop.comparables || []).slice(0, 10).map(c => ({ address: c.address, price: c.soldPrice ?? c.price, date: c.soldDate || c.date })),
        },
      };
      const res = await fetch('/api/ai/deal-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) { alert(data.message || 'AI review failed.'); return; }
      const r = data.review;
      const updated = withActivity({
        ...prop,
        analytics: { ...(prop.analytics || {}), aiSummary: r.summary, aiRiskFlags: r.riskFlags, aiStrengths: r.strengths, aiDealScore: r.dealScore, aiVerdict: r.verdict, aiReviewedAt: data.reviewedAt },
      }, 'intelligence', `AI deal review — score ${r.dealScore}/100 (${r.verdict.replace('_', ' ')})`);
      setProperties(prev => prev.map(p => p.id === prop.id ? updated : p));
      if (currentViewProperty?.id === prop.id) setCurrentViewProperty(updated);
    } catch {
      alert('AI review failed — network error.');
    } finally {
      setAiReviewLoadingId(null);
    }
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
      'Under Review':     { bg: '#eff6ff', color: '#1d4ed8' },
      'Bidding':          { bg: '#dcfce7', color: '#166534' },
      'Won':              { bg: '#d1fae5', color: '#065f46' },
      'Lost':             { bg: '#fee2e2', color: '#991b1b' },
      'Refurb':           { bg: '#fef9c3', color: '#854d0e' },
      'For Sale':         { bg: '#ccfbf1', color: '#0f766e' },
      'Completed':        { bg: '#dcfce7', color: '#15803d' },
      // legacy fallbacks so existing data still renders
      'Appraising':       { bg: '#eff6ff', color: '#1d4ed8' },
      'Approved':         { bg: '#ede9fe', color: '#6d28d9' },
      'Due Diligence':    { bg: '#fff7ed', color: '#c2410c' },
      'Exchanged':        { bg: '#d1fae5', color: '#065f46' },
      'Outbid':           { bg: '#fee2e2', color: '#991b1b' },
      'No Bid':           { bg: '#fef3c7', color: '#92400e' },
      'Tracked':          { bg: '#e2e8f0', color: '#334155' },
      'Found':            { bg: '#f1f5f9', color: '#475569' },
      'Researching':      { bg: '#eff6ff', color: '#1d4ed8' },
      'Research Completed': { bg: '#ede9fe', color: '#6d28d9' },
      'Surveying':        { bg: '#fff7ed', color: '#c2410c' },
      'Withdrawn':        { bg: '#f1f5f9', color: '#64748b' },
    };
    return map[status] || map['Sourced'];
  };

  const PIPELINE_STAGES = ['Sourced', 'Under Review', 'Bidding', 'Won', 'Lost', 'Refurb', 'For Sale', 'Completed'];

  // Map legacy stage names (from old data) to current stage names so kanban always shows them.
  // Stored records keep their original status string — only display/grouping is normalised.
  const LEGACY_STATUS_MAP = {
    'Found':              'Sourced',
    'Tracked':            'Sourced',
    'Researching':        'Under Review',
    'Research Completed': 'Under Review',
    'Surveying':          'Under Review',
    'Appraising':         'Under Review',
    'Approved':           'Under Review',
    'Due Diligence':      'Under Review',
    'Exchanged':          'Won',
    'Outbid':             'Lost',
    'No Bid':             'Lost',
    'Withdrawn':          'Lost',
  };
  const normaliseStatus = (s) => LEGACY_STATUS_MAP[s] || s || 'Sourced';
  // Bid-outcome detail formerly carried by the Outbid/No Bid statuses now lives in
  // property.bidOutcome ({ result: 'won'|'outbid'|'no_bid'|'withdrawn' }); legacy
  // statuses are read as a fallback so old records keep their detail.
  const getBidResult = (p) => {
    if (p.bidOutcome?.result) return p.bidOutcome.result;
    const s = p.status;
    if (s === 'Won' || s === 'Exchanged') return 'won';
    if (s === 'Outbid' || s === 'Lost') return 'outbid';
    if (s === 'No Bid') return 'no_bid';
    if (s === 'Withdrawn') return 'withdrawn';
    return null;
  };
  const STAGE_COLOURS = {
    'Sourced':        { bg: '#f8fafc', border: '#e2e8f0', head: '#64748b' },
    'Under Review':   { bg: '#eff6ff', border: '#bfdbfe', head: '#1d4ed8' },
    'Bidding':        { bg: '#f0fdf4', border: '#bbf7d0', head: '#166534' },
    'Won':            { bg: '#ecfdf5', border: '#6ee7b7', head: '#065f46' },
    'Lost':           { bg: '#fef2f2', border: '#fecaca', head: '#991b1b' },
    'Refurb':         { bg: '#fefce8', border: '#fde047', head: '#854d0e' },
    'For Sale':       { bg: '#f0fdfa', border: '#5eead4', head: '#0f766e' },
    'Completed':      { bg: '#f0fdf4', border: '#86efac', head: '#15803d' },
  };

  // Pipeline filters & view
  const [pipelineSort, setPipelineSort] = useState(_pf.pipelineSort || 'newest');
  const [pipelineTypeFilter, setPipelineTypeFilter] = useState(_pf.pipelineTypeFilter || 'ALL');
  const [pipelineStageFilter, setPipelineStageFilter] = useState(_pf.pipelineStageFilter || 'ALL');
  const [pipelineDateFrom, setPipelineDateFrom] = useState(_pf.pipelineDateFrom || '');
  const [pipelineDateTo, setPipelineDateTo] = useState(_pf.pipelineDateTo || '');
  const [showPipelineFilters, setShowPipelineFilters] = useState(false);
  const [showMapView, setShowMapView] = useState(false);
  const [mapGeoCache, setMapGeoCache] = useState({});

  // Kanban drag & drop + collapsible stages
  const [draggedPropId, setDraggedPropId] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [collapsedStages, setCollapsedStages] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  // Persisted alert feed (server-side, D1-backed)
  const [serverAlerts, setServerAlerts] = useState([]);
  const loadServerAlerts = () => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    fetch('/api/alerts', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setServerAlerts(d.alerts || []); })
      .catch(() => {});
  };
  useEffect(() => { loadServerAlerts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const postAlert = (a) => {
    const token = localStorage.getItem('crm_session');
    if (!token) return;
    fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(a) }).catch(() => {});
  };

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
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdSearch, setCmdSearch] = useState('');

  // Feature 1: Tasks & Follow-ups
  const [tasks, setTasks] = useState([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('Medium');
  const [newTaskLinkedType, setNewTaskLinkedType] = useState('');
  const [newTaskLinkedId, setNewTaskLinkedId] = useState('');
  const [newTaskNotes, setNewTaskNotes] = useState('');
  const [taskFilter, setTaskFilter] = useState('open');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editTaskDraft, setEditTaskDraft] = useState({});
  // Extended task state
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [expandedTaskSubTab, setExpandedTaskSubTab] = useState('subtasks');
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState(null);
  const [taskSubFilter, setTaskSubFilter] = useState('all');
  const [taskSidebarStatus, setTaskSidebarStatus] = useState('active');
  const [taskSidebarPriority, setTaskSidebarPriority] = useState('all');
  const [taskSidebarAssignee, setTaskSidebarAssignee] = useState('all');
  const [taskSidebarProperty, setTaskSidebarProperty] = useState('all');
  const [drawerNewComment, setDrawerNewComment] = useState('');
  const [drawerNewSubtask, setDrawerNewSubtask] = useState('');
  const [showTaskApplyModal, setShowTaskApplyModal] = useState(false);
  const [taskApplyTemplateSel, setTaskApplyTemplateSel] = useState('');
  const [taskApplyPropId, setTaskApplyPropId] = useState('');
  const [taskApplyDate, setTaskApplyDate] = useState('');
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState('not_started');
  const [newTaskWaitingOn, setNewTaskWaitingOn] = useState('');

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

  // ==========================================
  // REFURB COST & QUOTE BUILDER STATE
  // ==========================================
  const [refurbQuotes, setRefurbQuotes] = useState([]);
  const [rfSubTab, setRfSubTab] = useState('dashboard');
  // Quote modal
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [editingQuoteId, setEditingQuoteId] = useState(null);
  const [quoteForm, setQuoteForm] = useState({ ...EMPTY_QUOTE_FORM });
  const [quoteModalTab, setQuoteModalTab] = useState('details'); // details | scope | dates | rating
  // Filter state
  const [rfTradeFilter, setRfTradeFilter] = useState('ALL');
  const [rfStatusFilter, setRfStatusFilter] = useState('ALL');
  const [rfPropertyFilter, setRfPropertyFilter] = useState('ALL');
  const [rfCompanyFilter, setRfCompanyFilter] = useState('ALL');
  const [rfPricingFilter, setRfPricingFilter] = useState('ALL');
  const [rfSearch, setRfSearch] = useState('');
  const [rfShowFilters, setRfShowFilters] = useState(false);
  // Quote Mixer state
  const [mixerPropId, setMixerPropId] = useState('');
  const [mixerSel, setMixerSel] = useState({}); // { tradeCategory: quoteId }
  const [mixerContingency, setMixerContingency] = useState(10);
  // Timeline state
  const [tlPropId, setTlPropId] = useState('');

  // ==========================================
  // SPEC BUILDER STATE
  // ==========================================
  const [specItems, setSpecItems] = useState([]);
  const [specTemplates, setSpecTemplates] = useState([]);
  const [specAllowances, setSpecAllowances] = useState([]);
  // Trade & Product Catalog — the reusable pricing knowledge base shared by
  // Refurb Quotes (labour price book) and Spec Builder (product catalogue)
  const [catalogTrades, setCatalogTrades] = useState([]);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [specSubTab, setSpecSubTab] = useState('dashboard');
  const [specViewPropId, setSpecViewPropId] = useState('');
  const [specViewRoom, setSpecViewRoom] = useState('');
  // Item modal
  const [showSpecItemModal, setShowSpecItemModal] = useState(false);
  const [editingSpecItemId, setEditingSpecItemId] = useState(null);
  const [specItemForm, setSpecItemForm] = useState({ ...EMPTY_SPEC_ITEM });
  const [specItemModalTab, setSpecItemModalTab] = useState('product');
  const [urlFetchLoading, setUrlFetchLoading] = useState(false);
  const [urlFetchMsg, setUrlFetchMsg] = useState('');
  // Template modal
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [templateForm, setTemplateForm] = useState({ ...EMPTY_SPEC_TEMPLATE });
  const [templateEditTab, setTemplateEditTab] = useState('info');
  // Apply-template modal
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [applyTemplateSel, setApplyTemplateSel] = useState('');
  const [applyTemplatePropId, setApplyTemplatePropId] = useState('');
  const [applyTemplateRoom, setApplyTemplateRoom] = useState('');
  // Filters (All Items sub-tab)
  const [specPropFilter, setSpecPropFilter] = useState('ALL');
  const [specRoomFilter, setSpecRoomFilter] = useState('ALL');
  const [specCategoryFilter, setSpecCategoryFilter] = useState('ALL');
  const [specStatusFilter, setSpecStatusFilter] = useState('ALL');
  const [specSearch, setSpecSearch] = useState('');
  const [specSelectedOnly, setSpecSelectedOnly] = useState(false);

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
      .then(r => {
        if (r.status === 401) {
          localStorage.removeItem('crm_session');
          localStorage.removeItem('crm_user');
          window.location.reload();
          return null;
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
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
          if (d.refurbQuotes?.length) setRefurbQuotes(d.refurbQuotes);
          if (d.specItems?.length) setSpecItems(d.specItems);
          if (d.specTemplates?.length) setSpecTemplates(d.specTemplates);
          if (d.specAllowances?.length) setSpecAllowances(d.specAllowances);
          if (d.taskTemplates?.length) setTaskTemplates(d.taskTemplates);
          if (d.catalogTrades?.length) setCatalogTrades(d.catalogTrades);
          if (d.catalogProducts?.length) setCatalogProducts(d.catalogProducts);
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
        body: JSON.stringify({ properties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes, specItems, specTemplates, specAllowances, taskTemplates, catalogTrades, catalogProducts }),
      })
        .then(() => { setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 2000); })
        .catch(() => setSaveStatus('idle'));
    }, 2000);
    return () => clearTimeout(timer);
  }, [properties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes, specItems, specTemplates, specAllowances, taskTemplates, catalogTrades, catalogProducts, dataLoaded]);

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

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowCmdPalette(p => !p);
        setCmdSearch('');
      }
      if (e.key === 'Escape') setShowCmdPalette(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem('crm_pipeline_filters', JSON.stringify({ pipelineSort, pipelineTypeFilter, pipelineStageFilter, pipelineDateFrom, pipelineDateTo }));
  }, [pipelineSort, pipelineTypeFilter, pipelineStageFilter, pipelineDateFrom, pipelineDateTo]);

  useEffect(() => {
    if (activeTab === 'scraper' || activeTab === 'auctionintel') loadAuctionData();
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot this month's average margin so the dashboard can show a month-over-month trend
  useEffect(() => {
    const margins = properties.map(p => p.analytics?.margin ?? p.analytics?.profitMargin).filter(m => m != null && !isNaN(m));
    if (!margins.length) return;
    const avg = margins.reduce((a, b) => a + parseFloat(b), 0) / margins.length;
    const mk = new Date().toISOString().slice(0, 7);
    try {
      const h = JSON.parse(localStorage.getItem('crm_margin_history') || '{}');
      h[mk] = Math.round(avg * 10) / 10;
      localStorage.setItem('crm_margin_history', JSON.stringify(h));
    } catch { /* ignore */ }
  }, [properties]);

  const downloadPipelineCSV = (props) => {
    const cols = ['Deal Name','Address','Stage','Guide Price','Auction Date','Property Type','Bedrooms','Source','Net Profit','Margin %','Max Bid','Solicitor'];
    const esc = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
    const rows = props.map(p => {
      const sol = contacts.find(c => c.id === p.solicitorContactId);
      return [
        p.dealName || p.address?.split(',')[0] || '',
        p.address || '',
        normaliseStatus(p.status),
        p.guidePrice || '',
        p.auctionDate || '',
        p.propertyType || '',
        p.bedrooms || '',
        p.sourcePlatform || '',
        p.analytics?.netProfit || '',
        p.analytics?.profitMargin ?? p.analytics?.margin ?? '',
        p.analytics?.maxBid || p.maxBid || '',
        sol?.name || '',
      ].map(esc).join(',');
    });
    const csv = [cols.map(esc).join(','), ...rows].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `pipeline-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

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

  const filteredCompanies = (() => {
    const daysAgo = (d) => d ? Math.floor((new Date() - new Date(d)) / 86400000) : 99999;
    const coLastNote = (c) => {
      const ns = globalNotes.filter(n => n.targetType === 'Company' && n.targetId === c.id).sort((a, b) => b.date.localeCompare(a.date));
      return ns[0]?.date || '';
    };
    const coLinkedProps = (c) => properties.filter(p => (p.linkedCompanyIds || []).includes(c.id));
    const OPEN_STATUSES = ['Sourced', 'Under Review', 'Bidding', 'Refurb', 'For Sale'];
    let list = companies.filter(c => {
      if (companySearchType !== 'ALL' && c.type !== companySearchType) return false;
      if (companySearchTier === 'none' && c.tier) return false;
      if (companySearchTier !== 'ALL' && companySearchTier !== 'none' && c.tier !== companySearchTier) return false;
      if (companySearchCity !== 'ALL' && c.city !== companySearchCity) return false;
      if (companySearchQuery) {
        const q = companySearchQuery.toLowerCase();
        if (![c.name, c.city, c.type].join(' ').toLowerCase().includes(q)) return false;
      }
      const cc = contacts.filter(x => x.companyId === c.id).length;
      if (companyHasContacts === 'yes' && !cc) return false;
      if (companyHasContacts === 'no' && cc) return false;
      const pc = coLinkedProps(c).length;
      if (companyHasProperties === 'yes' && !pc) return false;
      if (companyHasProperties === 'no' && pc) return false;
      if (companyPropCount !== 'ANY') {
        if (companyPropCount === '0' && pc !== 0) return false;
        if (companyPropCount === '1-2' && (pc < 1 || pc > 2)) return false;
        if (companyPropCount === '3+' && pc < 3) return false;
      }
      const ln = coLastNote(c);
      const lda = daysAgo(ln);
      if (companyLastActivity === '7d' && lda > 7) return false;
      if (companyLastActivity === '30d' && lda > 30) return false;
      if (companyLastActivity === '90d' && lda > 90) return false;
      if (companyLastActivity === 'over90' && (lda <= 90 || lda === 99999)) return false;
      if (companyLastActivity === 'never' && ln) return false;
      const cda = daysAgo(c.createdDate || '');
      if (companyDateAdded === '7d' && cda > 7) return false;
      if (companyDateAdded === '30d' && cda > 30) return false;
      if (companyDateAdded === '90d' && cda > 90) return false;
      if (companyQuickKeyRel && c.tier !== 'Gold' && c.tier !== 'Silver') return false;
      if (companyQuickInactive && daysAgo(ln) <= 30) return false;
      if (companyQuickOpenProps && !coLinkedProps(c).some(p => OPEN_STATUSES.includes(normaliseStatus(p.status)))) return false;
      return true;
    });
    if (companySort === 'oldest') list.sort((a, b) => (a.createdDate || '').localeCompare(b.createdDate || ''));
    else if (companySort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (companySort === 'za') list.sort((a, b) => b.name.localeCompare(a.name));
    else if (companySort === 'most-props') list.sort((a, b) => properties.filter(p => (p.linkedCompanyIds || []).includes(b.id)).length - properties.filter(p => (p.linkedCompanyIds || []).includes(a.id)).length);
    else if (companySort === 'most-cons') list.sort((a, b) => contacts.filter(x => x.companyId === b.id).length - contacts.filter(x => x.companyId === a.id).length);
    else if (companySort === 'last-act') list.sort((a, b) => (coLastNote(b) || '0').localeCompare(coLastNote(a) || '0'));
    else if (companySort === 'dormant') list.sort((a, b) => (coLastNote(a) || '').localeCompare(coLastNote(b) || ''));
    else list.sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''));
    return list;
  })();

  const filteredContacts = (() => {
    const daysAgo = (d) => d ? Math.floor((new Date() - new Date(d)) / 86400000) : 99999;
    const conLastNote = (c) => {
      const ns = globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === c.id).sort((a, b) => b.date.localeCompare(a.date));
      return ns[0]?.date || c.lastActivity || '';
    };
    let list = contacts.filter(c => {
      if (contactSearchRole !== 'ALL' && c.role !== contactSearchRole) return false;
      if (contactSearchCompany !== 'ALL' && String(c.companyId) !== contactSearchCompany) return false;
      if (contactSearchCoType !== 'ALL') {
        const co = companies.find(x => x.id === c.companyId);
        if (!co || co.type !== contactSearchCoType) return false;
      }
      if (contactSearchQuery) {
        const q = contactSearchQuery.toLowerCase();
        if (![c.name, c.email, c.role, c.jobTitle].join(' ').toLowerCase().includes(q)) return false;
      }
      const hasN = globalNotes.some(n => n.targetType === 'Contact' && n.targetId === c.id);
      if (contactHasNotes === 'yes' && !hasN) return false;
      if (contactHasNotes === 'no' && hasN) return false;
      const ln = conLastNote(c);
      const lda = daysAgo(ln);
      if (contactLastActivity === '7d' && lda > 7) return false;
      if (contactLastActivity === '30d' && lda > 30) return false;
      if (contactLastActivity === '90d' && lda > 90) return false;
      if (contactLastActivity === 'over90' && (lda <= 90 || lda === 99999)) return false;
      if (contactLastActivity === 'never' && ln) return false;
      const cda = daysAgo(c.createdDate || '');
      if (contactDateAdded === '7d' && cda > 7) return false;
      if (contactDateAdded === '30d' && cda > 30) return false;
      if (contactDateAdded === '90d' && cda > 90) return false;
      if (contactSearchOrigin !== 'ALL' && c.origin !== contactSearchOrigin) return false;
      if (contactQuickActiveMonth && daysAgo(ln) > 30) return false;
      return true;
    });
    if (contactSort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else if (contactSort === 'za') list.sort((a, b) => b.name.localeCompare(a.name));
    else if (contactSort === 'last-act') list.sort((a, b) => (conLastNote(b) || '0').localeCompare(conLastNote(a) || '0'));
    else if (contactSort === 'dormant') list.sort((a, b) => (conLastNote(a) || '').localeCompare(conLastNote(b) || ''));
    else list.sort((a, b) => (b.createdDate || b.lastActivity || '').localeCompare(a.createdDate || a.lastActivity || ''));
    return list;
  })();

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
    /* Horizontal pill nav for mobile tabs */
    .crm-mobile-tab-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
    .crm-mobile-tab-scroll::-webkit-scrollbar { display: none; }
  `;

  const navBtnStyle = (tabKey, activeColor = '#059669') => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: sidebarCollapsed ? '0' : '11px',
    padding: sidebarCollapsed ? '10px 0' : '9px 14px',
    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '13.5px',
    fontWeight: '500',
    backgroundColor: activeTab === tabKey ? activeColor : 'transparent',
    color: activeTab === tabKey ? '#ffffff' : '#94a3b8',
  });

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', margin: 0, padding: 0, fontFamily: 'sans-serif', backgroundColor: '#f8fafc', flexDirection: isMobile ? 'column' : 'row' }}>
      <style>{RESPONSIVE_CSS}</style>

      {/* Command Palette (Cmd+K / Ctrl+K) */}
      {showCmdPalette && (() => {
        const q = cmdSearch.toLowerCase();
        const matchedProps = q.length > 1 ? properties.filter(p => p.address.toLowerCase().includes(q) || (p.postcode || '').toLowerCase().includes(q)).slice(0, 5) : properties.slice(0, 4);
        const matchedContacts = q.length > 1 ? contacts.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3) : [];
        const matchedCompanies = q.length > 1 ? companies.filter(c => c.name.toLowerCase().includes(q)).slice(0, 3) : [];
        const quickActions = [
          { label: 'Go to Dashboard', key: 'D', action: () => { setActiveTab('dashboard'); setShowCmdPalette(false); } },
          { label: 'Go to Pipeline', key: 'P', action: () => { setActiveTab('pipeline'); setShowCmdPalette(false); } },
          { label: 'Go to Tasks', key: 'T', action: () => { setActiveTab('tasks'); setShowCmdPalette(false); } },
          { label: 'Go to Contacts', key: 'C', action: () => { setActiveTab('contacts'); setShowCmdPalette(false); } },
        ].filter(a => !q || a.label.toLowerCase().includes(q));
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }} onClick={() => setShowCmdPalette(false)}>
            <div style={{ width: isMobile ? 'calc(100vw - 24px)' : '560px', maxWidth: '92vw', background: '#1e293b', borderRadius: '14px', border: '1px solid #334155', boxShadow: '0 25px 50px rgba(0,0,0,0.5)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid #334155' }}>
                <span style={{ color: '#64748b', fontSize: '16px' }}>🔍</span>
                <input
                  autoFocus
                  value={cmdSearch}
                  onChange={e => setCmdSearch(e.target.value)}
                  placeholder="Search properties, contacts, companies or jump to a page…"
                  style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: '14px', color: '#f1f5f9', fontFamily: 'inherit' }}
                />
                <span style={{ fontSize: '10px', color: '#475569', background: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #334155' }}>ESC</span>
              </div>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {matchedProps.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', padding: '10px 16px 5px', fontWeight: '600' }}>Properties</div>
                    {matchedProps.map(p => (
                      <div key={p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); setShowCmdPalette(false); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer', borderRadius: '0' }} onMouseEnter={e => e.currentTarget.style.background='#334155'} onMouseLeave={e => e.currentTarget.style.background=''}>
                        <span style={{ fontSize: '14px' }}>🏠</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.address.split(',')[0]}</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>{p.postcode} · {p.status || 'Sourced'} · £{(p.guidePrice||0).toLocaleString()}</div>
                        </div>
                        {p.isStrongBid && <span style={{ fontSize: '10px', background: '#052e16', color: '#4ade80', padding: '2px 6px', borderRadius: '6px' }}>Strong bid</span>}
                      </div>
                    ))}
                  </div>
                )}
                {matchedContacts.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', padding: '10px 16px 5px', fontWeight: '600' }}>Contacts</div>
                    {matchedContacts.map(c => (
                      <div key={c.id} onClick={() => { setActiveTab('contacts'); setCurrentViewContact(c); setShowCmdPalette(false); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background='#334155'} onMouseLeave={e => e.currentTarget.style.background=''}>
                        <span style={{ fontSize: '14px' }}>👤</span>
                        <div><div style={{ fontSize: '13px', color: '#f1f5f9' }}>{c.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{c.role || 'Contact'}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {matchedCompanies.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', padding: '10px 16px 5px', fontWeight: '600' }}>Companies</div>
                    {matchedCompanies.map(c => (
                      <div key={c.id} onClick={() => { setActiveTab('companies'); setCurrentViewCompany(c); setShowCmdPalette(false); }} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background='#334155'} onMouseLeave={e => e.currentTarget.style.background=''}>
                        <span style={{ fontSize: '14px' }}>🏢</span>
                        <div><div style={{ fontSize: '13px', color: '#f1f5f9' }}>{c.name}</div><div style={{ fontSize: '11px', color: '#64748b' }}>{c.type || 'Company'}</div></div>
                      </div>
                    ))}
                  </div>
                )}
                {quickActions.length > 0 && (
                  <div>
                    <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', padding: '10px 16px 5px', fontWeight: '600' }}>Quick actions</div>
                    {quickActions.map(a => (
                      <div key={a.label} onClick={a.action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background='#334155'} onMouseLeave={e => e.currentTarget.style.background=''}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '14px' }}>⚡</span>
                          <span style={{ fontSize: '13px', color: '#f1f5f9' }}>{a.label}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#475569', background: '#0f172a', padding: '2px 6px', borderRadius: '4px', border: '1px solid #334155' }}>{a.key}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ padding: '8px 16px', borderTop: '1px solid #334155', display: 'flex', gap: '12px', fontSize: '10px', color: '#475569' }}>
                <span>↵ Open</span><span>ESC Close</span><span style={{ marginLeft: 'auto' }}>Ctrl+K / ⌘K to toggle</span>
              </div>
            </div>
          </div>
        );
      })()}

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
        <div style={{ padding: sidebarCollapsed ? '16px 0' : '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: '10px', flexShrink: 0 }}>
          <Building2 size={22} style={{ color: '#10b981', flexShrink: 0 }} />
          {!sidebarCollapsed && <span style={{ fontSize: '17px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>A&A Partners CRM</span>}
        </div>
        <nav style={{ padding: sidebarCollapsed ? '12px 4px' : '12px', display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {(() => {
            const isAdmin = user.role === 'Admin';
            const allowed = isAdmin ? null : (user.allowedTabs || []);
            const can = (tab) => isAdmin || allowed.includes(tab);
            const go = (tab) => { setActiveTab(tab); setCurrentViewProperty(null); setCurrentViewCompany(null); setCurrentViewContact(null); setMobileMenuOpen(false); };
            return (
              <>
                {can('dashboard') && <button onClick={() => go('dashboard')} style={navBtnStyle('dashboard')}><LayoutDashboard size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Dashboard</span>}</button>}
                {can('pipeline') && <button onClick={() => go('pipeline')} style={navBtnStyle('pipeline')}><MapPin size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Pipeline</span>}</button>}
                {can('scraper') && <button onClick={() => go('scraper')} style={navBtnStyle('scraper')}><Calendar size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Triage {unreviewedScrapedCount > 0 && <span style={{ marginLeft: '4px', background: '#f87171', color: '#fff', borderRadius: '8px', fontSize: '10px', padding: '1px 5px' }}>{unreviewedScrapedCount}</span>}</span>}</button>}
                {can('surveyors') && <button onClick={() => go('surveyors')} style={navBtnStyle('surveyors')}><ClipboardList size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Surveyor Intel</span>}</button>}
                {can('auctionintel') && <button onClick={() => go('auctionintel')} style={navBtnStyle('auctionintel')}><TrendingUp size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Auction Intel</span>}</button>}
                {can('dealanalysis') && <button onClick={() => go('dealanalysis')} style={navBtnStyle('dealanalysis', '#7C3AED')}><BarChart2 size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Deal Analysis</span>}</button>}
                {can('portfolio') && <button onClick={() => go('portfolio')} style={navBtnStyle('portfolio', '#059669')}><DollarSign size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Portfolio</span>}</button>}
                <div style={{ margin: '8px 0 0', borderTop: '1px solid #1e293b', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {can('companies') && <button onClick={() => go('companies')} style={{ ...navBtnStyle('companies', '#0284c7'), color: '#ffffff' }}><Briefcase size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Companies</span>}</button>}
                  {can('contacts') && <button onClick={() => go('contacts')} style={{ ...navBtnStyle('contacts', '#0284c7'), color: '#ffffff' }}><Contact size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Contacts</span>}</button>}
                  {can('tasks') && <button onClick={() => go('tasks')} style={{ ...navBtnStyle('tasks', '#d97706'), color: '#ffffff' }}><ClipboardList size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Tasks</span>}</button>}
                  {can('refurb') && <button onClick={() => go('refurb')} style={{ ...navBtnStyle('refurb', '#b45309'), color: '#ffffff' }}><Briefcase size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Refurb Quotes</span>}</button>}
                  {can('spec') && <button onClick={() => go('spec')} style={{ ...navBtnStyle('spec', '#b45309'), color: '#ffffff' }}><ClipboardList size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Spec Builder</span>}</button>}
                </div>
              </>
            );
          })()}
        </nav>
        <div style={{ padding: sidebarCollapsed ? '12px 4px' : '12px', borderTop: '1px solid #1e293b', flexShrink: 0 }}>
          {/* Notification bell */}
          {(() => {
            const today = new Date();
            const upcomingAuctions = properties.filter(p => {
              if (!p.auctionDate) return false;
              const d = new Date(p.auctionDate);
              const days = Math.ceil((d - today) / 86400000);
              return days >= 0 && days <= 7;
            });
            const overdueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < today);
            const unreadServer = serverAlerts.filter(a => !a.read);
            const notifCount = upcomingAuctions.length + overdueTasks.length + unreadServer.length;
            const ALERT_ICONS = { stage_change: '🔀', task_overdue: '⏰', quote_stale: '💬', listing_change: '📉', auction_countdown: '🔨', task_autocreated: '✅' };
            const alertAgo = (iso) => { const h = Math.floor((Date.now() - new Date(iso)) / 3600000); return isNaN(h) ? '' : h < 1 ? 'now' : h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`; };
            const markAllRead = () => {
              const token = localStorage.getItem('crm_session');
              fetch('/api/alerts/mark-read', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ all: true }) }).catch(() => {});
              setServerAlerts(prev => prev.map(a => ({ ...a, read: 1 })));
            };
            return (
              <div style={{ position: 'relative', marginBottom: '8px' }}>
                <button onClick={() => { setShowNotifPanel(p => !p); if (!showNotifPanel) loadServerAlerts(); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: (sidebarCollapsed && !isMobile) ? '0' : '11px', padding: (sidebarCollapsed && !isMobile) ? '8px 0' : '8px 14px', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start', border: 'none', backgroundColor: showNotifPanel ? '#334155' : 'transparent', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px', position: 'relative', marginBottom: '4px' }}>
                  <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                    <Bell size={18} />
                    {notifCount > 0 && <span style={{ position: 'absolute', top: '-5px', right: '-6px', background: '#ef4444', color: '#fff', borderRadius: '8px', fontSize: '10px', fontWeight: '700', padding: '1px 4px', lineHeight: 1.2 }}>{notifCount}</span>}
                  </span>
                  {(!sidebarCollapsed || isMobile) && <span>Alerts</span>}
                </button>
                {showNotifPanel && (
                  <div style={{ position: 'absolute', bottom: '100%', left: sidebarCollapsed ? '60px' : '0', width: sidebarCollapsed ? '280px' : '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '10px', padding: '12px', marginBottom: '4px', zIndex: 200, boxShadow: '0 -4px 20px rgba(0,0,0,0.3)', maxHeight: '60vh', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ fontSize: '10px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em' }}>Alerts</div>
                      {unreadServer.length > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '10px', color: '#38bdf8', padding: 0 }}>Mark all read</button>}
                    </div>
                    {unreadServer.slice(0, 10).map(a => (
                      <div key={a.id} style={{ padding: '7px 8px', borderRadius: '6px', marginBottom: '3px', background: '#0f172a', borderLeft: '2px solid #38bdf8' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                          <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: '600', flex: 1 }}>{ALERT_ICONS[a.type] || '🔔'} {a.title}</span>
                          <span style={{ fontSize: '10px', color: '#475569', flexShrink: 0 }}>{alertAgo(a.created_at)}</span>
                        </div>
                        {a.body && <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>{a.body}</div>}
                      </div>
                    ))}
                    {notifCount === 0 && <div style={{ fontSize: '12px', color: '#64748b', padding: '8px 0' }}>All clear — nothing urgent.</div>}
                    {upcomingAuctions.length > 0 && (
                      <>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginBottom: '4px' }}>UPCOMING AUCTIONS</div>
                        {upcomingAuctions.slice(0,5).map(p => {
                          const days = Math.ceil((new Date(p.auctionDate) - today) / 86400000);
                          return (
                            <div key={p.id} onClick={() => { setCurrentViewProperty(p); setShowNotifPanel(false); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px', background: '#0f172a' }}>
                              <span style={{ fontSize: '11px', color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dealName || p.address?.split(',')[0]}</span>
                              <span style={{ fontSize: '10px', fontWeight: '700', color: days === 0 ? '#f87171' : days <= 2 ? '#fbbf24' : '#34d399', marginLeft: '8px', flexShrink: 0 }}>{days === 0 ? 'Today' : `${days}d`}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {overdueTasks.length > 0 && (
                      <>
                        <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: upcomingAuctions.length ? '8px' : '0', marginBottom: '4px' }}>OVERDUE TASKS</div>
                        {overdueTasks.slice(0,3).map(t => (
                          <div key={t.id} onClick={() => { setActiveTab('tasks'); setShowNotifPanel(false); }} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', marginBottom: '2px', background: '#0f172a' }}>
                            <span style={{ fontSize: '11px', color: '#fca5a5', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                            <span style={{ fontSize: '10px', color: '#f87171', marginLeft: '8px', flexShrink: 0 }}>Overdue</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
          {!isMobile && <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', border: 'none', backgroundColor: '#1e293b', color: '#94a3b8', cursor: 'pointer', borderRadius: '8px', marginBottom: '6px' }}>
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>}
          <button onClick={() => { setActiveTab('settings'); setCurrentViewProperty(null); setCurrentViewCompany(null); setCurrentViewContact(null); setMobileMenuOpen(false); }} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: (sidebarCollapsed && !isMobile) ? '0' : '11px', padding: (sidebarCollapsed && !isMobile) ? '9px 0' : '9px 14px', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start', borderRadius: '8px', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13.5px', fontWeight: '500', backgroundColor: activeTab === 'settings' ? '#334155' : 'transparent', color: activeTab === 'settings' ? '#ffffff' : '#94a3b8' }}>
            <Settings size={18} style={{ flexShrink: 0 }} />{(!sidebarCollapsed || isMobile) && <span>Settings</span>}
          </button>
          <button onClick={onLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: (sidebarCollapsed && !isMobile) ? '0' : '11px', padding: (sidebarCollapsed && !isMobile) ? '8px 0' : '8px 14px', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start', border: 'none', backgroundColor: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '13.5px' }}>
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
            const MAIN_STAGES = ['Sourced', 'Under Review', 'Bidding'];
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
              <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', flexDirection: 'column' }}>

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

                {/* ════════════════════════════════════
                    FULL-WIDTH DARK BANNER
                ════════════════════════════════════ */}
                {/* Breadcrumb top bar — dark (desktop) */}
                {!isMobile && (
                  <div style={{ background: '#0f172a', borderBottom: '1px solid #1e293b', padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, overflowX: 'auto' }}>
                    <button onClick={() => setCurrentViewProperty(null)} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#64748b', fontSize: '11px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      <ArrowLeft size={12} /> Pipeline
                    </button>
                    <span style={{ color: '#475569', fontSize: '11px', flexShrink: 0 }}>/</span>
                    <span style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{currentViewProperty.dealName || currentViewProperty.address}</span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Stage</span>
                      {MAIN_STAGES.map((s, i) => {
                        const done = stIdx > i; const cur = st === s;
                        return <button key={s} onClick={() => updateFieldInView('status', s)} title={s} style={{ width: '9px', height: '9px', borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer', background: done ? '#059669' : cur ? '#7C3AED' : '#334155' }} />;
                      })}
                    </div>
                  </div>
                )}

                {/* Property header — dark */}
                <div style={{ padding: '12px 20px', borderBottom: '1px solid #1e293b', background: '#0f172a', flexShrink: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '15px', fontWeight: '600', color: '#f1f5f9', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {currentViewProperty.dealName || currentViewProperty.address}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {currentViewProperty.auctionDate && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={11} /> {currentViewProperty.auctionDate}{currentViewProperty.auctionTime ? ` · ${currentViewProperty.auctionTime}` : ''}</span>}
                        {currentViewProperty.sourcePlatform && <span>{currentViewProperty.sourcePlatform}</span>}
                        {currentViewProperty.address && <span style={{ color: '#475569' }}>{currentViewProperty.address}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => { setPropMapOpen(o => !o); }}
                        title="Toggle property location map"
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: `1px solid ${propMapOpen ? '#38bdf8' : '#334155'}`, background: propMapOpen ? '#0c2a3d' : 'transparent', color: propMapOpen ? '#38bdf8' : '#94a3b8', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                      >
                        📍 {propMapOpen ? 'Hide map' : 'Show map'}
                      </button>
                      <button
                        onClick={() => runPropertyIntelligence(currentViewProperty)}
                        disabled={intelligenceRunning || !propPostcode}
                        title={propPostcode ? 'Run public API intelligence for this property' : 'Add a postcode to the address to enable intelligence'}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '5px 10px', borderRadius: '6px', border: '1px solid', cursor: intelligenceRunning || !propPostcode ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', opacity: !propPostcode ? 0.45 : 1, background: intel.lastRun ? '#052e16' : 'transparent', borderColor: intel.lastRun ? '#166534' : '#334155', color: intel.lastRun ? '#86efac' : '#94a3b8', fontFamily: 'inherit' }}
                      >
                        {intelligenceRunning ? '⏳ Running…' : intel.lastRun ? '🔍 Refresh Intel' : '🔍 Run Intelligence'}
                      </button>
                      {currentViewProperty.listingUrl && (
                        <a href={currentViewProperty.listingUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#38bdf8', padding: '5px 10px', border: '1px solid #0c4a6e', borderRadius: '6px', background: '#0c2a3d', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                          <ExternalLink size={11} /> Listing
                        </a>
                      )}
                      {daysLeft != null && (
                        <div style={{ background: '#1e293b', color: '#f8fafc', borderRadius: '8px', padding: '6px 13px', textAlign: 'center' }}>
                          <div style={{ fontSize: daysLeft >= 0 ? '22px' : '15px', fontWeight: '600', lineHeight: 1, color: daysLeft <= 3 && daysLeft >= 0 ? '#f87171' : '#f8fafc' }}>{daysLeft >= 0 ? daysLeft : '—'}</div>
                          <div style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>{daysLeft > 0 ? 'days to go' : daysLeft === 0 ? 'today!' : 'passed'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Badges */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#1e3a5f', color: '#60a5fa' }}>{st}</span>
                    {an.bidStrength === 'Strong' && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#052e16', color: '#4ade80' }}>✓ Strong Bid</span>}
                    {an.bidStrength === 'Conservative' && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#451a03', color: '#fcd34d' }}>Conservative</span>}
                    {an.bidStrength === 'Weak' && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#3f1515', color: '#fca5a5' }}>Weak bid</span>}
                    {daysLeft != null && daysLeft >= 0 && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#3f1a00', color: '#fbbf24' }}>⏱ {daysLeft === 0 ? 'Today' : `${daysLeft} days`}</span>}
                    {(an.epcRating || an.floorArea) && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#1e1b4b', color: '#a5b4fc' }}>{an.epcRating ? `EPC ${an.epcRating}` : ''}{an.epcRating && an.floorArea ? ' · ' : ''}{an.floorArea ? `${an.floorArea}m²` : ''}</span>}
                    {currentViewProperty.planningToBid && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '500', background: '#1e3a5f', color: '#93c5fd' }}>Planning to bid</span>}
                  </div>
                </div>

                {/* KPI strip — dark, 5 tiles */}
                <div style={{ borderBottom: '1px solid #1e293b', background: '#0f172a', flexShrink: 0 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)' }}>
                    {[
                      { l: 'Guide price', v: gp ? fmtNum(gp) : '—', vc: '#f1f5f9', editKey: 'guidePrice', src: gp ? 'Listing' : '' },
                      { l: 'Max bid', v: maxBid ? fmtNum(maxBid) : '—', vc: maxBid ? '#4ade80' : '#f1f5f9', editKey: 'maxBid', src: an.maxBid ? 'Report' : (currentViewProperty.maxBid ? 'Manual' : '') },
                      { l: 'Net profit', v: netProfit ? fmtNum(netProfit) : '—', vc: netProfit ? '#4ade80' : '#f1f5f9', src: an.netProfit ? 'Report' : '' },
                      { l: 'Margin', v: margin != null ? `${margin.toFixed(1)}%` : '—', vc: margin >= 20 ? '#4ade80' : margin >= 10 ? '#fbbf24' : margin != null ? '#f87171' : '#f1f5f9', src: (an.profitMargin != null || an.margin != null) ? 'Report' : '' },
                      { l: 'ROI', v: (an.roi != null && an.roi !== '') ? `${parseFloat(an.roi).toFixed(1)}%` : '—', vc: (an.roi != null && an.roi !== '') ? '#4ade80' : '#f1f5f9', src: (an.roi != null && an.roi !== '') ? 'Report' : '' },
                    ].map((k, i) => (
                      <div key={k.l} style={{ padding: '8px 13px', borderRight: i < 4 ? '1px solid #1e293b' : 'none', position: 'relative' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <div style={{ fontSize: '10px', color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>{k.l}</div>
                          {i === 0 && (
                            <button onClick={() => setEditingKpi(e => !e)} title="Edit figures" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', fontSize: '11px', color: editingKpi ? '#a78bfa' : '#475569', lineHeight: 1 }}>⚙</button>
                          )}
                        </div>
                        {editingKpi && k.editKey ? (
                          <input
                            type="number"
                            value={k.editKey === 'guidePrice' ? (currentViewProperty.guidePrice || '') : (currentViewProperty.maxBid || '')}
                            onChange={e => updateFieldInView(k.editKey, parseInt(e.target.value) || 0)}
                            style={{ width: '100%', fontSize: '14px', fontWeight: '600', border: 'none', borderBottom: '1px solid #7C3AED', background: 'transparent', color: k.vc, outline: 'none', fontFamily: 'inherit', padding: '2px 0' }}
                          />
                        ) : (
                          <div style={{ fontSize: '15px', fontWeight: '600', color: k.vc }}>{k.v}</div>
                        )}
                        {k.src && <div style={{ display: 'inline-block', marginTop: '3px', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.04em', padding: '1px 5px', borderRadius: '3px', background: k.src === 'Report' ? '#0c2a3d' : '#1e293b', color: k.src === 'Report' ? '#60a5fa' : '#64748b' }}>{k.src}</div>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Inline map panel */}
                {propMapOpen && propPostcode && (
                  <div style={{ borderBottom: '0.5px solid #e2e8f0', position: 'relative', flexShrink: 0 }}>
                    <iframe title="Property location map" width="100%" height="200" style={{ border: 0, display: 'block' }} src={`https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_KEY}&q=${encodeURIComponent(currentViewProperty.address)}&zoom=14`} allowFullScreen />
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(currentViewProperty.address)}`} target="_blank" rel="noreferrer" style={{ position: 'absolute', bottom: '8px', right: '8px', fontSize: '10px', background: 'rgba(255,255,255,0.9)', padding: '3px 8px', borderRadius: '4px', color: '#0284c7', textDecoration: 'none', border: '1px solid #bfdbfe' }}>Open in Google Maps ↗</a>
                  </div>
                )}

                {/* Tab bar — dark */}
                <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', background: '#0f172a', flexShrink: 0, overflowX: 'auto', padding: '0 8px' }}>
                  {[
                    { k: 'overview', l: 'Overview' },
                    { k: 'intel', l: 'Intelligence', dot: intel.lastRun },
                    { k: 'financials', l: 'Deal Analysis' },
                    { k: 'documents', l: 'Documents', count: (Object.values(propFiles).filter(Boolean).length + (currentViewProperty.customDocs?.length || 0)) || null },
                    { k: 'notes', l: 'Notes', count: currentViewProperty.notesList?.length },
                    { k: 'timeline', l: 'Timeline', count: actLog.length > 0 ? actLog.length : null },
                  ].map(t => (
                    <button key={t.k} onClick={() => setPropCanvasTab(t.k)} style={{ padding: '9px 14px', fontSize: '12px', border: 'none', borderBottom: `2px solid ${propCanvasTab === t.k ? '#7C3AED' : 'transparent'}`, background: 'transparent', color: propCanvasTab === t.k ? '#f1f5f9' : '#64748b', fontWeight: propCanvasTab === t.k ? '600' : '400', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      {t.l}
                      {t.count > 0 && <span style={{ fontSize: '10px', background: '#1e293b', color: '#94a3b8', padding: '1px 5px', borderRadius: '8px' }}>{t.count}</span>}
                      {t.dot && !t.count && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#059669', display: 'inline-block' }} />}
                    </button>
                  ))}
                </div>

                {/* ════════════════════════════════════
                    CONTENT ROW: sidebar + main
                ════════════════════════════════════ */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>

                {/* ════ INTELLIGENCE SIDEBAR ════ */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={currentViewProperty.postcode || ''}
                        onChange={e => updateFieldInView('postcode', e.target.value.toUpperCase())}
                        placeholder="Postcode e.g. S6 2AB"
                        style={{ fontSize: '11px', color: propPostcode ? '#86efac' : '#94a3b8', background: 'transparent', border: 'none', borderBottom: `1px dashed ${propPostcode ? '#34d399' : '#475569'}`, outline: 'none', width: isMobile ? '150px' : '110px', padding: isMobile ? '8px 0' : '0 0 1px 0', fontFamily: 'inherit', letterSpacing: '0.05em' }}
                      />
                      {!propPostcode && <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: '600' }}>REQUIRED FOR ENRICHMENT</span>}
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
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '7px' }}>Pipeline stage</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {MAIN_STAGES.map(s => (
                        <button key={s} onClick={() => updateFieldInView('status', s)} style={{ padding: isMobile ? '8px 12px' : '3px 8px', borderRadius: '4px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: st === s ? '#1e3a5f' : 'transparent', borderColor: st === s ? '#3b82f6' : '#334155', color: st === s ? '#93c5fd' : '#64748b' }}>{s}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569', margin: '8px 0 5px' }}>Auction outcome</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[
                        { s: 'Won', result: 'won', sel: { bg: '#052e16', bc: '#4ade80', tc: '#86efac' } },
                        { s: 'Lost — outbid', result: 'outbid', sel: { bg: '#3f1515', bc: '#f87171', tc: '#fca5a5' } },
                        { s: 'Lost — no bid', result: 'no_bid', sel: { bg: '#1e293b', bc: '#94a3b8', tc: '#cbd5e1' } },
                      ].map(({ s, result, sel }) => {
                        const active = getBidResult(currentViewProperty) === result && (st === 'Won' || st === 'Lost');
                        return <button key={s} onClick={() => setPropertyOutcome(result)} style={{ padding: isMobile ? '8px 12px' : '3px 8px', borderRadius: '4px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: active ? sel.bg : 'transparent', borderColor: active ? sel.bc : '#334155', color: active ? sel.tc : '#64748b' }}>{s}</button>;
                      })}
                    </div>
                    <div style={{ fontSize: '10px', color: '#475569', margin: '8px 0 5px' }}>Post-auction</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[
                        { s: 'Refurb', sel: { bg: '#422006', bc: '#fde047', tc: '#fef08a' } },
                        { s: 'For Sale', sel: { bg: '#042f2e', bc: '#5eead4', tc: '#99f6e4' } },
                        { s: 'Completed', sel: { bg: '#052e16', bc: '#86efac', tc: '#bbf7d0' } },
                      ].map(({ s, sel }) => {
                        const active = st === s;
                        return <button key={s} onClick={() => updateFieldInView('status', s)} style={{ padding: isMobile ? '8px 12px' : '3px 8px', borderRadius: '4px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: active ? sel.bg : 'transparent', borderColor: active ? sel.bc : '#334155', color: active ? sel.tc : '#64748b' }}>{s}</button>;
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
                          <div style={{ fontSize: '10px', color: '#475569' }}>/ 100</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: '500', color: '#f1f5f9', marginBottom: '5px' }}>{an.bidStrength} deal</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                            {netProfit > 0 && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: '500', background: '#052e16', color: '#86efac' }}>£{(netProfit / 1000).toFixed(0)}k profit</span>}
                            {an.comps && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: '500', background: '#1e293b', color: '#64748b' }}>{an.comps} comps</span>}
                            {an.epcRating && <span style={{ padding: '2px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: '500', background: '#451a03', color: '#fcd34d' }}>EPC {an.epcRating}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Bid strategy */}
                  {(walkBid || targetBid || stretchBid) ? (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Bid strategy</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '5px' }}>
                        {[
                          { l: 'Walk', v: walkBid, bg: '#1a2234', bc: '#334155', lc: '#94a3b8', vc: '#e2e8f0' },
                          { l: 'Target', v: targetBid, bg: '#052e16', bc: '#166534', lc: '#86efac', vc: '#4ade80' },
                          { l: 'Stretch', v: stretchBid || maxBid, bg: '#451a03', bc: '#854d0e', lc: '#fcd34d', vc: '#fbbf24' },
                        ].filter(b => b.v > 0).map(b => (
                          <div key={b.l} style={{ borderRadius: '6px', padding: '7px 5px', textAlign: 'center', border: `0.5px solid ${b.bc}`, background: b.bg }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.04em', color: b.lc, marginBottom: '2px', opacity: 0.8 }}>{b.l}</div>
                            <div style={{ fontSize: '11px', fontWeight: '500', color: b.vc }}>{fmtK(b.v)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Refurb level */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '7px' }}>Refurb level</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {[
                        { k: 'light', l: '🔨 Light', cost: an.refurbLight },
                        { k: 'medium', l: '🏗️ Medium', cost: an.refurbMedium },
                        { k: 'heavy', l: '⚒️ Heavy', cost: an.refurbHeavy },
                      ].map(r => {
                        const active = (currentViewProperty.refurbLevel || 'medium') === r.k;
                        return (
                          <button key={r.k} onClick={() => updateFieldInView('refurbLevel', r.k)} style={{ padding: isMobile ? '8px 12px' : '3px 8px', borderRadius: '10px', fontSize: '10px', border: '0.5px solid', cursor: 'pointer', fontFamily: 'inherit', background: active ? '#7C3AED' : 'transparent', borderColor: active ? '#7C3AED' : '#334155', color: active ? '#fff' : '#64748b', fontWeight: active ? '600' : '400' }}>
                            {r.l}{r.cost ? ` £${Math.round(r.cost / 1000)}k` : ''}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Auction details — editable */}
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Auction details</div>
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

                  {/* Solicitor */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '6px' }}>Solicitor</div>
                    <select
                      value={currentViewProperty.solicitorContactId || ''}
                      onChange={e => updateFieldInView('solicitorContactId', parseInt(e.target.value) || null)}
                      style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', borderRadius: '5px', color: currentViewProperty.solicitorContactId ? '#f1f5f9' : '#475569', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }}
                    >
                      <option value="">— assign solicitor —</option>
                      {contacts.filter(c => c.role === 'Solicitor' || c.role === 'Legal').map(c => (
                        <option key={c.id} value={c.id}>{c.name}{c.companyId ? ` · ${companies.find(co => co.id === c.companyId)?.name || ''}` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* Intel quick view */}
                  {(an.epcRating || an.floorArea || an.comps || daysLeft != null) && (
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Intel quick view</div>
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
                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#475569', marginBottom: '8px' }}>Documents</div>
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
                    {/* Flexible / additional documents */}
                    {(currentViewProperty.customDocs || []).map(doc => (
                      <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '0.5px solid #1e293b', fontSize: '11px' }}>
                        <span style={{ color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                          <FileText size={11} color="#4ade80" style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>{doc.name}</span>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <button onClick={() => handleViewDocument(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '1px', fontSize: '10px', fontFamily: 'inherit' }}>View</button>
                          <button onClick={() => handleRemoveCustomDoc(doc.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '1px', display: 'flex' }}><Trash2 size={10} /></button>
                        </span>
                      </div>
                    ))}
                    <label style={{ cursor: 'pointer', fontSize: '10px', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '5px', padding: '7px 0 1px' }}>
                      <Plus size={11} /> Add document
                      <input type="file" style={{ display: 'none' }} onChange={handleCustomDocUpload} />
                    </label>
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


                  {/* AI deal summary — Overview tab */}
                  {propCanvasTab === 'overview' && an.aiSummary && (
                    <div style={{ margin: '14px 20px 0', borderRadius: '8px', border: '1px solid #fde68a', background: '#fffbeb', padding: '10px 12px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: '14px', flexShrink: 0 }}>🤖</span>
                      <div>
                        <div style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '.07em', color: '#92400e', marginBottom: '3px' }}>AI deal summary</div>
                        <div style={{ fontSize: '11px', color: '#451a03', lineHeight: '1.5' }}>{an.aiSummary}</div>
                      </div>
                    </div>
                  )}

                  {/* ══ THE TERMINAL — intel power view ══ */}
                  {propCanvasTab === 'intel' && intel.lastRun && (() => {
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
                      { icon: '🏫', l: 'Schools',   v: schoolBest ? `${schoolBest}${schoolD.outstandingCount > 0 ? ` · ${schoolD.outstandingCount} O/S` : ''}` : ic.schools ? (osmD.nearestSchoolM != null ? (osmD.nearestSchoolM < 1000 ? `${osmD.nearestSchoolM}m` : `${(osmD.nearestSchoolM/1000).toFixed(1)}km`) : 'No schools found') : 'Run intel', ok: ic.schools ? schoolOk : osmD.nearestSchoolM != null ? (osmD.nearestSchoolM <= 500 ? 'ok' : osmD.nearestSchoolM <= 1500 ? 'warn' : 'bad') : 'neutral' },
                      { icon: '🏘️', l: 'Amenities', v: osmD.amenityLabel || (ic.osm ? 'No data' : 'Run intel'), d: stationM ? `Stn ${stationM}m` : '', ok: osmD.amenityScore != null ? (osmD.amenityScore >= 7 ? 'ok' : osmD.amenityScore >= 4 ? 'warn' : 'bad') : 'neutral' },
                      { icon: '🚇', l: 'Transport', v: transportV, ok: transportOk },
                      { icon: '📊', l: 'IMD',       v: imdDec != null ? `Decile ${imdDec} · ${imdD.label || ''}` : ic.imd ? 'No data' : 'Run intel', ok: imdDec != null ? (imdDec >= 7 ? 'ok' : imdDec >= 4 ? 'warn' : 'bad') : 'neutral' },
                    ];

                    return (
                      <div style={{ borderBottom: '0.5px solid #e2e8f0', background: '#fafafa', flexShrink: 0 }}>

                        {/* Row 1 — KPI chips */}
                        <div style={{ padding: '9px 16px', borderBottom: '0.5px solid #e2e8f0', display: 'grid', gridTemplateColumns: isMobile ? 'repeat(4,1fr)' : 'repeat(8,1fr)', gap: '7px' }}>
                          {kpiChips.map(chip => {
                            const col = SC[chip.ok];
                            return (
                              <div key={chip.l} style={{ background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '7px', padding: '7px 9px', textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '.05em' }}>{chip.l}</div>
                                <div style={{ fontSize: '15px', fontWeight: '500', color: col.c, lineHeight: 1.1 }}>{chip.v}</div>
                                <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chip.d}</div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Row 2 — Sparkline | Intel signals */}
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', borderBottom: '0.5px solid #e2e8f0' }}>

                          {/* Sparkline */}
                          <div style={{ padding: '11px 14px', borderRight: '0.5px solid #e2e8f0' }}>
                            <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '7px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span>{spkLabel || (lrD.salesCount ? `${lrD.salesCount} Land Registry sales` : 'Price trend')}</span>
                              {useHpiFallback && <span style={{ fontSize: '10px', color: '#93c5fd' }}>HPI</span>}
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
                            <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '7px', display: 'flex', justifyContent: 'space-between' }}>
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
                                    <span style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '8px', background: col.bg, color: col.c, flexShrink: 0 }}>
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
                          <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>Notes</span>
                            <span style={{ fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{currentViewProperty.notesList?.length || 0} notes</span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
                            {/* Composer */}
                            <form onSubmit={handleAddPropertyNote} style={{ border: '0.5px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
                                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: NOTE_TYPE_COLORS[noteType] || '#94a3b8', flexShrink: 0 }} />
                                <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ padding: isMobile ? '8px 10px' : '3px 6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', fontFamily: 'inherit', background: '#fff', color: '#0f172a', outline: 'none' }}>
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
                                      <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: typeBg, color: typeText, fontWeight: '500' }}>{n.type}</span>
                                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>{n.author}</span>
                                      {n.bookmarked && <Bookmark size={9} fill="#0284c7" color="#0284c7" />}
                                      <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto' }}>{n.date}</span>
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

                  {/* Auction result capture — shows when auction date has passed and result not yet recorded */}
                  {propCanvasTab === 'overview' && daysLeft !== null && daysLeft <= 0 && !['Won', 'Lost', 'Refurb', 'For Sale', 'Completed'].includes(st) && (() => {
                    const hammer = currentViewProperty.hammerPrice || 0;
                    const labelStyle = { fontSize: '10px', color: '#92400e', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' };
                    const inpStyle = { width: '100%', padding: '6px 10px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px', fontFamily: 'inherit', background: '#fff', outline: 'none', boxSizing: 'border-box' };
                    const overStretch = hammer && stretchBid && hammer > stretchBid;
                    const noteParts = [];
                    if (hammer) {
                      if (targetBid && hammer <= targetBid) noteParts.push('within target bid range');
                      else if (stretchBid && hammer <= stretchBid) noteParts.push('above target but within stretch');
                      else if (overStretch) noteParts.push('above stretch bid — over budget');
                      if (stretchBid && hammer < stretchBid) noteParts.push(`£${(stretchBid - hammer).toLocaleString()} below stretch bid`);
                    }
                    return (
                    <div style={{ margin: '14px 20px', borderRadius: '10px', border: '2px solid #fde68a', background: '#fffbeb', overflow: 'hidden' }}>
                      <div style={{ padding: '10px 14px', background: '#fef9c3', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>🔔</span>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#92400e' }}>Auction Result — {currentViewProperty.dealName || currentViewProperty.address?.split(',')[0]}</div>
                        <div style={{ marginLeft: 'auto', fontSize: '11px', color: '#92400e' }}>{currentViewProperty.auctionDate}{currentViewProperty.sourcePlatform ? ` · ${currentViewProperty.sourcePlatform}` : ''}</div>
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                          {[
                            { result: 'won', label: '🏆 Won', bg: '#f0fdf4', bc: '#059669', tc: '#166534' },
                            { result: 'outbid', label: '❌ Lost / Outbid', bg: '#fef2f2', bc: '#dc2626', tc: '#991b1b' },
                            { result: 'no_bid', label: '⏭ No bid placed', bg: '#f8fafc', bc: '#64748b', tc: '#475569' },
                          ].map(r => (
                            <button key={r.result} onClick={() => setPropertyOutcome(r.result)} style={{ flex: 1, padding: '8px 6px', borderRadius: '7px', border: `1px solid ${r.bc}`, background: r.bg, color: r.tc, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>{r.label}</button>
                          ))}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={labelStyle}>Hammer price</div>
                            <input type="number" value={currentViewProperty.hammerPrice || ''} onChange={e => updateFieldInView('hammerPrice', parseInt(e.target.value) || null)} placeholder="e.g. 72000" style={inpStyle} />
                          </div>
                          <div>
                            <div style={{ ...labelStyle, color: '#64748b' }}>Max bid set (reference)</div>
                            <div style={{ ...inpStyle, background: '#f8fafc', color: '#64748b' }}>{maxBid ? `£${maxBid.toLocaleString()}` : '—'}</div>
                          </div>
                          <div>
                            <div style={labelStyle}>Outbid at (if lost)</div>
                            <input type="number" value={currentViewProperty.outbidPrice || ''} onChange={e => updateFieldInView('outbidPrice', parseInt(e.target.value) || null)} placeholder="e.g. 85000" style={inpStyle} />
                          </div>
                          <div>
                            <div style={labelStyle}>Actual buyer's premium</div>
                            <input type="number" value={currentViewProperty.actualBuyersPremium || ''} onChange={e => updateFieldInView('actualBuyersPremium', parseInt(e.target.value) || null)} placeholder="e.g. 2160" style={inpStyle} />
                          </div>
                        </div>
                        {noteParts.length > 0 && (
                          <div style={{ marginTop: '12px', padding: '9px 12px', background: overStretch ? '#fef2f2' : '#f0fdf4', border: `1px solid ${overStretch ? '#fecaca' : '#bbf7d0'}`, borderRadius: '7px', fontSize: '12px', color: overStretch ? '#991b1b' : '#166534' }}>
                            {overStretch ? '⚠' : '✓'} Hammer price {noteParts.join(' · ')} · <b>Click “Won” to record the result</b>
                          </div>
                        )}
                      </div>
                    </div>
                    );
                  })()}

                  {/* Deal Outturn — actual vs predicted (post-auction stages) */}
                  {propCanvasTab === 'overview' && ['Won', 'Refurb', 'For Sale', 'Completed'].includes(st) && (() => {
                    const predPurchase = parseFloat(an.targetBid) || maxBid || 0;
                    const refurbKey = currentViewProperty.refurbLevel || 'medium';
                    const predRefurb = parseFloat(refurbKey === 'light' ? an.refurbLight : refurbKey === 'heavy' ? an.refurbHeavy : an.refurbMedium) || 0;
                    const predSale = baseGDV || 0;
                    const predProfit = parseFloat(an.netProfit) || 0;
                    const totalInv = parseFloat(an.totalInvestment) || 0;
                    const predPremium = parseFloat(an.buyersPremium) || 0;
                    const actPurchase = currentViewProperty.hammerPrice || 0;
                    const actRefurb = currentViewProperty.actualRefurbCost || 0;
                    const actPremium = currentViewProperty.actualBuyersPremium || 0;
                    const actSale = currentViewProperty.actualSalePrice || 0;
                    const otherCosts = Math.max(0, totalInv - predPurchase - predRefurb - predPremium) + actPremium;
                    const actProfit = actSale ? Math.round(actSale - actPurchase - actRefurb - otherCosts) : null;
                    const outLabel = { fontSize: '10px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' };
                    const outInput = { width: '100%', fontSize: '18px', fontWeight: '700', color: '#0f172a', marginTop: '4px', border: 'none', borderBottom: '1px dashed #e2e8f0', background: 'transparent', outline: 'none', fontFamily: 'inherit', padding: '1px 0', boxSizing: 'border-box' };
                    const outPred = { fontSize: '11px', color: '#94a3b8', marginTop: '3px' };
                    return (
                    <div style={{ margin: '14px 20px', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', background: '#fff' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>📊</span>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>Deal Outturn — Actual vs Predicted</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4,1fr)', gap: '1px', background: '#f1f5f9' }}>
                        <div style={{ background: '#fff', padding: '14px' }}>
                          <div style={outLabel}>Purchase price</div>
                          <input type="number" value={currentViewProperty.hammerPrice || ''} onChange={e => updateFieldInView('hammerPrice', parseInt(e.target.value) || null)} placeholder="—" style={outInput} />
                          <div style={outPred}>Predicted: {predPurchase ? `£${predPurchase.toLocaleString()}` : '—'}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '14px' }}>
                          <div style={outLabel}>Refurb cost</div>
                          <input type="number" value={currentViewProperty.actualRefurbCost || ''} onChange={e => updateFieldInView('actualRefurbCost', parseInt(e.target.value) || null)} placeholder="—" style={{ ...outInput, color: (actRefurb && predRefurb && actRefurb > predRefurb) ? '#d97706' : '#0f172a' }} />
                          <div style={outPred}>Budget: {predRefurb ? `£${predRefurb.toLocaleString()}` : '—'}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '14px' }}>
                          <div style={outLabel}>Sale price</div>
                          <input type="number" value={currentViewProperty.actualSalePrice || ''} onChange={e => updateFieldInView('actualSalePrice', parseInt(e.target.value) || null)} placeholder="—" style={outInput} />
                          <div style={outPred}>GDV base: {predSale ? `£${predSale.toLocaleString()}` : '—'}</div>
                        </div>
                        <div style={{ background: '#fff', padding: '14px' }}>
                          <div style={outLabel}>Actual profit</div>
                          <div style={{ ...outInput, borderBottom: 'none', color: actProfit == null ? '#94a3b8' : actProfit >= 0 ? '#059669' : '#dc2626' }}>{actProfit == null ? '—' : `£${actProfit.toLocaleString()}`}</div>
                          <div style={outPred}>Predicted: {predProfit ? `£${predProfit.toLocaleString()}` : '—'}</div>
                        </div>
                      </div>
                      {actProfit != null && predProfit ? (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#64748b' }}>
                          Variance: <b style={{ color: (actProfit - predProfit) >= 0 ? '#059669' : '#dc2626' }}>{(actProfit - predProfit) >= 0 ? '+' : '−'}£{Math.abs(actProfit - predProfit).toLocaleString()} profit</b> vs prediction{actRefurb && predRefurb && actRefurb > predRefurb ? ` · refurb ran £${(actRefurb - predRefurb).toLocaleString()} over budget` : ''}{actSale && predSale && actSale < predSale ? ` · sold £${(predSale - actSale).toLocaleString()} under base GDV` : ''}{actSale && predSale && actSale > predSale ? ` · sold £${(actSale - predSale).toLocaleString()} over base GDV` : ''}
                        </div>
                      ) : (
                        <div style={{ padding: '10px 14px', borderTop: '1px solid #f1f5f9', fontSize: '11px', color: '#94a3b8' }}>Enter actual refurb cost and sale price to complete the outturn.</div>
                      )}
                    </div>
                    );
                  })()}

                  {/* Bid strategy cards */}
                  {propCanvasTab === 'overview' && (walkBid || targetBid || stretchBid) ? (
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
                  {propCanvasTab === 'overview' && an.verdict && (
                    <div style={{ padding: '12px 20px', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px', background: /STRONG/i.test(an.verdict) ? '#f0fdf4' : /DO NOT|AVOID/i.test(an.verdict) ? '#fef2f2' : '#fffbeb' }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', background: /STRONG/i.test(an.verdict) ? '#dcfce7' : /DO NOT|AVOID/i.test(an.verdict) ? '#fee2e2' : '#fef9c3' }}>
                        {/STRONG/i.test(an.verdict) ? '✅' : /DO NOT|AVOID/i.test(an.verdict) ? '🚫' : '⚠️'}
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '3px' }}>Report verdict</div>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: /STRONG/i.test(an.verdict) ? '#166534' : /DO NOT|AVOID/i.test(an.verdict) ? '#991b1b' : '#92400e' }}>{an.verdict}</div>
                      </div>
                      {(an.walkAway || an.breakEvenBid) && (
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', flexShrink: 0 }}>
                          {an.breakEvenBid && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Break-even</div><div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{fmtNum(an.breakEvenBid)}</div></div>}
                          {an.walkAway && <div style={{ textAlign: 'center' }}><div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em' }}>Walk away</div><div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{fmtNum(an.walkAway)}</div></div>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Two-col: GDV + Survey */}
                  {propCanvasTab === 'financials' && (consGDV || baseGDV || maxGDV || surveyJobs.length > 0) && (
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
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: '2px' }}>{activeSel.l} GDV</div>
                                    <div style={{ fontSize: '20px', fontWeight: '600', color: activeSel.vc }}>{fmtNum(activeSel.v)}</div>
                                  </div>
                                  {an.totalInvestment > 0 && (
                                    <div style={{ textAlign: 'right' }}>
                                      <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.05em', color: '#64748b', marginBottom: '2px' }}>Implied profit</div>
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

                  {/* Red Flags */}
                  {propCanvasTab === 'overview' && an.redFlags?.length > 0 && (
                    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0', background: '#fff5f5' }}>
                      <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.07em', color: '#991b1b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        🚩 Red Flags
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {an.redFlags.map((flag, fi) => (
                          <div key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '11px', color: '#7f1d1d', lineHeight: '1.4' }}>
                            <span style={{ flexShrink: 0, marginTop: '1px' }}>▸</span>
                            <span>{flag}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended surveyors — Overview tab, when no survey logged yet */}
                  {propCanvasTab === 'overview' && surveyJobs.length === 0 && (() => {
                    const propDistrict = (propPostcode || '').split(' ')[0].toUpperCase();
                    const propArea = propDistrict.match(/^[A-Z]+/)?.[0] || '';
                    const recs = (surveyors || []).map(s => {
                      const ratings = s.ratings || [];
                      if (!ratings.length) return null;
                      const rNums = ratings.map(r => parseFloat(r.rating)).filter(n => n > 0);
                      const avgRating = rNums.length ? rNums.reduce((a, b) => a + b, 0) / rNums.length : 0;
                      const costs = ratings.map(r => parseFloat(r.cost)).filter(c => c > 0);
                      const avgCost = costs.length ? Math.round(costs.reduce((a, b) => a + b, 0) / costs.length) : null;
                      const turns = ratings.map(r => parseInt(r.turnaroundDays)).filter(t => t > 0);
                      const avgTurn = turns.length ? Math.round(turns.reduce((a, b) => a + b, 0) / turns.length) : null;
                      let districtJobs = 0, areaJobs = 0;
                      ratings.forEach(r => {
                        const pc = (extractPostcode(r.propertyAddress || '') || '').toUpperCase();
                        const d = pc.split(' ')[0];
                        const ar = d.match(/^[A-Z]+/)?.[0] || '';
                        if (propDistrict && d === propDistrict) districtJobs++;
                        else if (propArea && ar === propArea) areaJobs++;
                      });
                      const score = districtJobs * 100 + areaJobs * 30 + avgRating * 10 - (avgTurn || 12) * 0.1;
                      return { s, avgRating, avgCost, avgTurn, jobCount: ratings.length, districtJobs, areaJobs, score };
                    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 3);
                    if (recs.length === 0) return null;
                    return (
                    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        📋 Recommended surveyors{propDistrict ? <span style={{ textTransform: 'none', letterSpacing: 0, color: '#64748b', fontWeight: '400' }}>— matched for {propDistrict}</span> : ''}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {recs.map((r, ri) => {
                          const best = ri === 0;
                          const loc = r.districtJobs > 0 ? { t: `📍 ${r.districtJobs} job${r.districtJobs !== 1 ? 's' : ''} in ${propDistrict}`, c: '#166534' } : r.areaJobs > 0 ? { t: `📍 ${r.areaJobs} job${r.areaJobs !== 1 ? 's' : ''} in ${propArea}-area`, c: '#92400e' } : { t: 'No local history', c: '#94a3b8' };
                          return (
                            <div key={r.s.id} style={{ border: `${best ? '1.5px' : '1px'} solid ${best ? '#bbf7d0' : '#e2e8f0'}`, background: best ? '#fafffe' : '#fff', borderRadius: '10px', padding: '11px 13px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>{r.s.name}{best && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#dcfce7', color: '#166534', fontWeight: '600', marginLeft: '6px' }}>Best match</span>}</div>
                                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{[r.s.company, r.s.speciality].filter(Boolean).join(' · ') || '—'}</div>
                                </div>
                                <button onClick={() => setShowSurveyJobModal(true)} style={{ flexShrink: 0, padding: '5px 12px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: `1px solid ${best ? '#059669' : '#e2e8f0'}`, background: best ? '#059669' : '#fff', color: best ? '#fff' : '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>Book</button>
                              </div>
                              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '9px', fontSize: '11px' }}>
                                <span style={{ color: '#f59e0b', fontWeight: '600' }}>★ {r.avgRating.toFixed(1)} <span style={{ color: '#94a3b8', fontWeight: '400' }}>({r.jobCount} job{r.jobCount !== 1 ? 's' : ''})</span></span>
                                <span style={{ color: loc.c }}>{loc.t}</span>
                                {r.avgCost ? <span style={{ color: '#64748b' }}>~£{r.avgCost} avg</span> : null}
                                {r.avgTurn ? <span style={{ color: '#64748b' }}>{r.avgTurn}-day turnaround</span> : null}
                                {r.s.phone && r.s.phone !== '--' ? <span style={{ color: '#0284c7' }}>{r.s.phone}</span> : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px' }}>Ranked by jobs in this postcode district → rating → turnaround, from your own survey history.</div>
                    </div>
                    );
                  })()}

                  {/* Cost stack — Overview tab */}
                  {propCanvasTab === 'financials' && (
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
                            <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ padding: isMobile ? '8px 12px' : '4px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '11px', fontFamily: 'inherit', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: '500', outline: 'none' }}>
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
                  )}

                  {/* Documents — Documents tab */}
                  {propCanvasTab === 'documents' && (
                    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '12px' }}>Document vault</div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                        {FILE_KEYS.map(({ key, label, accept }) => {
                          const rec = propFiles[key];
                          const isReport = key === 'mainReport';
                          return (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', border: `1px solid ${rec ? '#bbf7d0' : '#e2e8f0'}`, borderRadius: '8px', background: rec ? '#fafffe' : '#ffffff' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                                <FileText size={16} color={rec ? '#059669' : '#cbd5e1'} style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>{label}{isReport && rec && <span style={{ fontSize: '10px', fontWeight: '500', color: rec.type === 'html' ? '#059669' : '#d97706', marginLeft: '6px' }}>{rec.type === 'html' ? '· parsed' : '· PDF (not parsed)'}</span>}</div>
                                  <div style={{ fontSize: '11px', color: rec ? '#059669' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rec ? rec.name : 'Not uploaded'}</div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                {rec ? (
                                  <>
                                    <button onClick={() => handleViewDocument(rec)} style={{ padding: '5px 11px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                                    {isReport && <button onClick={handleReparseReport} title="Re-run the parser on this report to re-pull AI summary, red flags, GDV scenarios and figures" style={{ padding: '5px 11px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#7C3AED', cursor: 'pointer', fontFamily: 'inherit' }}>Re-parse</button>}
                                    <button onClick={() => handleDeleteReportFile(key, label)} title="Remove this document" style={{ padding: '5px 9px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: '1px solid #fecaca', background: '#fff5f5', color: '#dc2626', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center' }}><Trash2 size={12} /></button>
                                  </>
                                ) : (
                                  <label style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer' }}>Upload<input type="file" accept={accept} style={{ display: 'none' }} onChange={e => handleVaultUpload(e, key)} /></label>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Additional documents</span>
                        <label style={{ fontSize: '11px', fontWeight: '600', color: '#7C3AED', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'none', letterSpacing: 0 }}>
                          <Plus size={13} /> Add document
                          <input type="file" style={{ display: 'none' }} onChange={handleCustomDocUpload} />
                        </label>
                      </div>
                      {(currentViewProperty.customDocs || []).length === 0 ? (
                        <div style={{ fontSize: '12px', color: '#94a3b8', padding: '10px 0' }}>No additional documents — use “Add document” for any file beyond the standard slots.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {(currentViewProperty.customDocs || []).map(doc => (
                            <div key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                                <FileText size={15} color="#059669" style={{ flexShrink: 0 }} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>{doc.name}</div>
                                  {doc.uploadedAt && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{new Date(doc.uploadedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <button onClick={() => handleViewDocument(doc)} style={{ padding: '5px 12px', fontSize: '11px', fontWeight: '600', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                                <button onClick={() => handleRemoveCustomDoc(doc.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '3px', display: 'flex' }}><Trash2 size={14} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Notes — Notes tab */}
                  {propCanvasTab === 'notes' && (
                    <div style={{ padding: '14px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ fontSize: '10px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Notes</span>
                        <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '400', textTransform: 'none', letterSpacing: 0 }}>{currentViewProperty.notesList?.length || 0} notes</span>
                      </div>
                      <form onSubmit={handleAddPropertyNote} style={{ border: '0.5px solid #e2e8f0', borderRadius: '9px', overflow: 'hidden', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '8px 12px', borderBottom: '0.5px solid #f1f5f9', background: '#f8fafc', flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: NOTE_TYPE_COLORS[noteType] || '#94a3b8', flexShrink: 0 }} />
                            <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ padding: isMobile ? '8px 12px' : '4px 8px', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '11px', fontFamily: 'inherit', background: '#fff', color: '#0f172a', cursor: 'pointer', fontWeight: '500', outline: 'none' }}>
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
                        <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder={NOTE_TYPE_PLACEHOLDERS[noteType] || 'Add a note…'} style={{ width: '100%', minHeight: '72px', padding: '9px 12px', border: 'none', fontSize: '12px', fontFamily: 'inherit', resize: 'none', color: '#0f172a', outline: 'none', lineHeight: '1.6', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 12px', borderTop: '0.5px solid #f1f5f9', background: '#f8fafc' }}>
                          <button type="submit" style={{ padding: '5px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>Post note</button>
                        </div>
                      </form>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
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
                  )}

                  {/* Activity log — Timeline tab */}
                  {propCanvasTab === 'timeline' && (() => {
                    const timelineColorMap = { stage: '#7C3AED', note: '#0284c7', document: '#059669', intelligence: '#d97706', survey: '#c2410c', created: '#475569', bid: '#dc2626', result: '#059669' };
                    const timelineBgMap   = { stage: '#F5F3FF', note: '#e0f2fe', document: '#dcfce7', intelligence: '#fef3c7', survey: '#fff7ed', created: '#f1f5f9', bid: '#fee2e2', result: '#dcfce7' };
                    return (
                    <div style={{ padding: '14px 20px 20px', borderBottom: '0.5px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <div style={{ fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.07em', color: '#94a3b8' }}>Activity Timeline</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{actLog.length} event{actLog.length !== 1 ? 's' : ''}</div>
                      </div>
                      {actLog.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: '12px' }}>No activity recorded yet.<br /><span style={{ fontSize: '11px' }}>Stage changes, notes, and bids will appear here.</span></div>
                      ) : (
                        <div style={{ position: 'relative', paddingLeft: '28px' }}>
                          {/* vertical rail */}
                          <div style={{ position: 'absolute', left: '10px', top: '4px', bottom: '4px', width: '2px', background: 'linear-gradient(to bottom, #e2e8f0, #f1f5f9)' }} />
                          {actLog.map((a, idx) => {
                            const col = timelineColorMap[a.type] || '#94a3b8';
                            const bg  = timelineBgMap[a.type]   || '#f8fafc';
                            return (
                              <div key={a.id} style={{ position: 'relative', marginBottom: idx < actLog.length - 1 ? '16px' : '0' }}>
                                {/* dot */}
                                <div style={{ position: 'absolute', left: '-22px', top: '4px', width: '12px', height: '12px', borderRadius: '50%', background: col, border: '2px solid #fff', boxShadow: `0 0 0 2px ${col}40` }} />
                                <div style={{ background: '#fff', border: `1px solid ${col}30`, borderLeft: `3px solid ${col}`, borderRadius: '0 8px 8px 0', padding: '8px 12px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '20px', background: bg, color: col, fontWeight: '600', textTransform: 'capitalize', flexShrink: 0 }}>{a.type}</span>
                                        <span style={{ fontSize: '11px', color: '#64748b' }}>{a.user}</span>
                                      </div>
                                      <div style={{ fontSize: '12px', fontWeight: '500', color: '#0f172a' }}>{a.detail}</div>
                                    </div>
                                    <div style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0, marginTop: '2px' }}>{fmtAt(a.at)}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    );
                  })()}

                  {/* ── Property Intelligence Panel — Intel tab ── */}
                  {propCanvasTab === 'intel' && (
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
                                      {s.ofstedRating && <span style={{ flexShrink: 0, fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: ratingCol.bg, color: ratingCol.c, fontWeight: '600' }}>{s.ofstedRating}</span>}
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
                                  {tfl.lines.map(l => <span key={l} style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', background: '#f1f5f9', color: '#475569' }}>{l}</span>)}
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
                          {lr?.items?.length > 0 && (() => {
                            const subjectRooms = epc?.habitableRooms ? parseInt(epc.habitableRooms) : null;
                            const matchedItems = subjectRooms && lr.compsEnriched
                              ? lr.items.filter(it => !it.habitableRooms || parseInt(it.habitableRooms) === subjectRooms)
                              : lr.items;
                            const displayItems = matchedItems.length > 0 ? matchedItems : lr.items;
                            const isFiltered = matchedItems.length < lr.items.length;
                            return (
                            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden', marginTop: '8px' }}>
                              <div style={{ padding: '8px 12px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', fontSize: '11px', fontWeight: '600', color: '#0f172a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>📋 Land Registry Comparables</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {lr.compsEnriched && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af' }}>+ EPC enriched</span>}
                                  {isFiltered && <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#f0fdf4', color: '#166534' }}>{subjectRooms} rooms match</span>}
                                  <span style={{ fontWeight: '400', color: '#94a3b8' }}>{displayItems.length} sales · {currentViewProperty.postcode || extractPostcode(currentViewProperty.address || '')}</span>
                                </div>
                              </div>
                              <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                {displayItems.slice(0, 12).map((item, i) => {
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
                                            <span style={{ fontSize: '10px', padding: '0 4px', borderRadius: '3px', background: epcBg, color: epcTxt, fontWeight: '700', lineHeight: '14px' }}>EPC {item.epcRating}</span>
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
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                  )}

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
          <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#ffffff', flexDirection: isMobile ? 'column' : 'row', overflowY: isMobile ? 'auto' : 'visible' }}>
            <div style={{ width: isMobile ? '100%' : '300px', borderRight: isMobile ? 'none' : '1px solid #e2e8f0', borderBottom: isMobile ? '1px solid #e2e8f0' : 'none', padding: isMobile ? '20px' : '32px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
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

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '16px' : '32px', overflowY: 'auto', gap: '24px', boxSizing: 'border-box', minWidth: 0 }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Log Assessment Feedback / Activity</h3>
                <form onSubmit={(e) => handleAddUnifiedNote(e, 'company', currentViewCompany.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type feedback notes, updates, or instructions here..." style={{ width: '100%', height: '70px', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} style={{ padding: isMobile ? '8px' : '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Ashley">Ashley</option><option value="Femi">Femi</option>
                      </select>
                      <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ padding: isMobile ? '8px' : '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Call">📞 Call</option><option value="Meeting">🤝 Meeting</option><option value="Email">✉️ Email</option><option value="Review">📋 Review</option>
                      </select>
                    </div>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600', color: '#475569' }}>
                      <input type="checkbox" checked={noteBookmark} onChange={(e) => setNoteBookmark(e.target.checked)} /> Pinned to Dashboard Checklist
                    </label>
                    <button type="submit" style={{ backgroundColor: '#0284c7', color: 'white', padding: isMobile ? '10px 14px' : '6px 14px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Save Activity Line</button>
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
          <div style={{ display: 'flex', height: '100%', width: '100%', backgroundColor: '#ffffff', flexDirection: isMobile ? 'column' : 'row', overflowY: isMobile ? 'auto' : 'visible' }}>
            <div style={{ width: isMobile ? '100%' : '300px', borderRight: isMobile ? 'none' : '1px solid #e2e8f0', borderBottom: isMobile ? '1px solid #e2e8f0' : 'none', padding: isMobile ? '20px' : '32px', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>
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

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: isMobile ? '16px' : '32px', overflowY: 'auto', gap: '24px', boxSizing: 'border-box', minWidth: 0 }}>
              <div style={{ backgroundColor: '#ffffff', border: '1px solid #cbd5e1', padding: '20px', borderRadius: '8px' }}>
                <h3 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>Log Custom Note for Contact Profile</h3>
                <form onSubmit={(e) => handleAddUnifiedNote(e, 'contact', currentViewContact.id)} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Type background profile updates or tracking notes..." style={{ width: '100%', height: '70px', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                      <select value={noteAuthor} onChange={(e) => setNoteAuthor(e.target.value)} style={{ padding: isMobile ? '8px' : '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Ashley">Ashley</option><option value="Femi">Femi</option>
                      </select>
                      <select value={noteType} onChange={(e) => setNoteType(e.target.value)} style={{ padding: isMobile ? '8px' : '6px', borderRadius: '4px', fontSize: '12px', border: '1px solid #cbd5e1' }}>
                        <option value="Call">📞 Call</option><option value="Meeting">🤝 Meeting</option><option value="Email">✉️ Email</option><option value="Review">📋 Review</option>
                      </select>
                    </div>
                    <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="checkbox" checked={noteBookmark} onChange={(e) => setNoteBookmark(e.target.checked)} /> Pin to Dashboard Secure Checklist
                    </label>
                    <button type="submit" style={{ backgroundColor: '#0f172a', color: 'white', padding: isMobile ? '10px 14px' : '6px 14px', border: 'none', borderRadius: '4px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>Append Note Profile</button>
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
                {activeTab === 'dashboard' && '📊 Dashboard'}
                {activeTab === 'pipeline' && '🏠 Live Property Tracker Pipeline'}
                {activeTab === 'scraper' && '🔎 Auction Triage — scraped lots & manual watchlist'}
                {activeTab === 'surveyors' && '📋 Surveyor Intelligence Hub'}
                {activeTab === 'auctionintel' && '📈 Auction Intelligence'}
                {activeTab === 'companies' && '🏢 Linked Corporate Accounts Engine'}
                {activeTab === 'contacts' && '👥 Sourcing Contacts Profile Roster'}
                {activeTab === 'dealanalysis' && '📊 Deal Analysis & Scenario Matrix'}
                {activeTab === 'portfolio' && '💷 Portfolio P&L'}
                {activeTab === 'tasks' && '✅ Tasks & Follow-ups'}
                {activeTab === 'refurb' && '🔨 Refurb Cost & Trade Quote Builder'}
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
                const todayStr = today.toISOString().split('T')[0];
                const hour = today.getHours();
                const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
                const firstName = (user.name || 'there').split(' ')[0];
                const strongBids = properties.filter(p => p.isStrongBid);
                const settledStages = ['Won', 'Lost', 'Refurb', 'For Sale', 'Completed'];
                const capitalAtRisk = properties.filter(p => !settledStages.includes(normaliseStatus(p.status))).reduce((s, p) => s + (p.maxBid || 0), 0);
                const marginsArr = properties.map(p => p.analytics?.margin ?? p.analytics?.profitMargin).filter(m => m != null && !isNaN(m));
                const avgMargin = marginsArr.length ? (marginsArr.reduce((a, b) => a + parseFloat(b), 0) / marginsArr.length) : null;
                let lastMonthMargin = null;
                try { const h = JSON.parse(localStorage.getItem('crm_margin_history') || '{}'); const d = new Date(); d.setMonth(d.getMonth() - 1); lastMonthMargin = h[d.toISOString().slice(0, 7)] ?? null; } catch { /* ignore */ }
                const weekAgoMs = Date.now() - 7 * 86400000;
                const newThisWeek = properties.filter(p => typeof p.id === 'number' && p.id > weekAgoMs).length;
                const overdueTasks = tasks.filter(t => t.status === 'open' && t.dueDate && t.dueDate < todayStr);
                const todayTasks = tasks.filter(t => t.status === 'open' && t.dueDate === todayStr);
                const strongSoon = strongBids.filter(p => { if (!p.auctionDate) return false; const d = Math.ceil((new Date(p.auctionDate) - today) / 86400000); return d >= 0 && d <= 7; }).length;
                const auctionsThisWeek = properties.filter(p => { if (!p.auctionDate) return false; const d = Math.ceil((new Date(p.auctionDate) - today) / 86400000); return d >= 0 && d <= 14; }).sort((a, b) => new Date(a.auctionDate) - new Date(b.auctionDate));
                const openTasks = tasks.filter(t => t.status === 'open' && t.dueDate).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6);
                const relDate = (ds) => { const d = new Date(ds); const diff = Math.round((new Date(ds) - new Date(todayStr)) / 86400000); if (diff < 0) return { txt: `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} ago`, color: '#dc2626', dot: '#dc2626' }; if (diff === 0) return { txt: 'Today', color: '#92400e', dot: '#d97706' }; if (diff === 1) return { txt: 'Tomorrow', color: '#64748b', dot: '#d97706' }; return { txt: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), color: '#64748b', dot: '#059669' }; };
                const propName = (pid) => { const p = properties.find(x => x.id === pid); return p ? (p.dealName || p.address?.split(',')[0] || '') : ''; };
                const recentActivity = properties
                  .flatMap(p => (p.activityLog || []).map(a => ({ ...a, propName: p.dealName || p.address?.split(',')[0] || 'Property', propId: p.id })))
                  .filter(a => a.at)
                  .sort((a, b) => new Date(b.at) - new Date(a.at))
                  .slice(0, 5);
                const fmtAgo = iso => { const d = new Date(iso); const h = Math.floor((Date.now() - d) / 3600000); return isNaN(d) ? '' : h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
                const wlDrops = watchlist.filter(w => w.guidePrev && w.guidePrice && w.guidePrev > w.guidePrice).map(w => ({ ...w, _kind: 'drop' }));
                const wlNew = watchlist.filter(w => { if (!w.addedDate) return false; const days = (today - new Date(w.addedDate)) / 86400000; return days >= 0 && days <= 14 && !(w.guidePrev && w.guidePrev > w.guidePrice); }).map(w => ({ ...w, _kind: 'new' }));
                const wlAlerts = [...wlDrops, ...wlNew].slice(0, 6);
                const tile = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px' };
                const kpiNum = { fontSize: '26px', fontWeight: '700', color: '#0f172a', marginTop: '4px' };
                const kpiLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' };
                const panel = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' };
                const panelHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', fontSize: '12px', fontWeight: '600', color: '#0f172a' };
                const dashLink = { fontSize: '11px', color: '#7C3AED', cursor: 'pointer' };
                const dashEmpty = { fontSize: '12px', color: '#94a3b8', padding: '8px 0' };
                const openAddProp = () => { const ah = companies.filter(c => c.type === 'Auction House'); setNewPropPlatform(ah[0]?.name || ''); setNewPropAddress(''); setNewPropGuide(''); setNewPropDate(''); setNewPropType('Residential'); setShowAddPropertyModal(true); };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Greeting header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#0f172a' }}>{greeting}, {firstName}</div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>{today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · A&amp;A Investment Partners</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button onClick={() => setShowCmdPalette(true)} title="Search (Ctrl+K)" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#fff', fontSize: '12px', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>
                          🔍 <span style={{ fontSize: '10px', background: '#f1f5f9', padding: '1px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>⌘K</span>
                        </button>
                        <button onClick={openAddProp} style={{ background: '#7C3AED', color: '#fff', border: 'none', borderRadius: '8px', padding: '9px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>+ Add property</button>
                      </div>
                    </div>

                    {/* 5 KPI tiles — emoji + trend */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)', gap: '12px' }}>
                      <div style={tile}>
                        <div style={{ fontSize: '20px' }}>🏠</div>
                        <div style={kpiNum}>{totalDeals}</div>
                        <div style={kpiLabel}>Active pipeline</div>
                        <div style={{ fontSize: '11px', color: newThisWeek > 0 ? '#059669' : '#94a3b8', marginTop: '4px' }}>{newThisWeek > 0 ? `↑ ${newThisWeek} this week` : 'No new this week'}</div>
                      </div>
                      <div style={tile}>
                        <div style={{ fontSize: '20px' }}>🔥</div>
                        <div style={{ ...kpiNum, color: '#059669' }}>{strongBidCount}</div>
                        <div style={kpiLabel}>Strong bids</div>
                        <div style={{ fontSize: '11px', color: strongSoon > 0 ? '#d97706' : '#94a3b8', marginTop: '4px' }}>{strongSoon > 0 ? `${strongSoon} auction${strongSoon !== 1 ? 's' : ''} < 7 days` : 'None imminent'}</div>
                      </div>
                      <div style={tile}>
                        <div style={{ fontSize: '20px' }}>💰</div>
                        <div style={{ ...kpiNum, fontSize: '22px' }}>£{(capitalAtRisk / 1000).toFixed(0)}k</div>
                        <div style={kpiLabel}>Capital at risk</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Across active bids</div>
                      </div>
                      <div style={{ ...tile, border: `1px solid ${overdueTasks.length > 0 ? '#fecaca' : '#e2e8f0'}`, background: overdueTasks.length > 0 ? '#fff5f5' : '#fff' }}>
                        <div style={{ fontSize: '20px' }}>📋</div>
                        <div style={{ ...kpiNum, color: overdueTasks.length > 0 ? '#dc2626' : '#0f172a' }}>{overdueTasks.length}</div>
                        <div style={kpiLabel}>Tasks overdue</div>
                        <div style={{ fontSize: '11px', color: overdueTasks.length > 0 ? '#dc2626' : '#94a3b8', marginTop: '4px' }}>{overdueTasks.length > 0 ? 'Needs attention' : todayTasks.length > 0 ? `${todayTasks.length} due today` : 'All clear'}</div>
                      </div>
                      <div style={tile}>
                        <div style={{ fontSize: '20px' }}>📊</div>
                        <div style={{ ...kpiNum, color: avgMargin != null ? '#0f172a' : '#94a3b8' }}>{avgMargin != null ? `${avgMargin.toFixed(0)}%` : '—'}</div>
                        <div style={kpiLabel}>Avg margin</div>
                        <div style={{ fontSize: '11px', marginTop: '4px', color: (avgMargin != null && lastMonthMargin != null) ? (avgMargin >= lastMonthMargin ? '#059669' : '#dc2626') : '#94a3b8' }}>
                          {(avgMargin != null && lastMonthMargin != null) ? `${avgMargin >= lastMonthMargin ? '↑' : '↓'} vs ${lastMonthMargin.toFixed(0)}% last month` : `${marginsArr.length} deal${marginsArr.length !== 1 ? 's' : ''} with data`}
                        </div>
                      </div>
                    </div>

                    {/* 3-column grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px', alignItems: 'flex-start' }}>

                      {/* Auctions this week */}
                      <div style={panel}>
                        <div style={panelHead}><span>⏱ Auctions this week</span><span onClick={() => setActiveTab('pipeline')} style={dashLink}>View all →</span></div>
                        {auctionsThisWeek.length === 0 ? (
                          <div style={dashEmpty}>No auctions in the next 14 days.</div>
                        ) : auctionsThisWeek.slice(0, 6).map(p => {
                          const days = Math.ceil((new Date(p.auctionDate) - today) / 86400000);
                          const dc = days <= 2 ? { bg: '#fee2e2', c: '#dc2626' } : days <= 7 ? { bg: '#fef3c7', c: '#92400e' } : { bg: '#dcfce7', c: '#166534' };
                          return (
                            <div key={p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); }} style={{ display: 'flex', gap: '10px', marginBottom: '14px', cursor: 'pointer' }}>
                              <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: dc.bg, color: dc.c, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ fontSize: '15px', fontWeight: '700', lineHeight: 1 }}>{days}</div>
                                <div style={{ fontSize: '10px', textTransform: 'uppercase' }}>{days === 1 ? 'day' : 'days'}</div>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dealName || p.address.split(',')[0]} {p.isStrongBid ? <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: '#dcfce7', color: '#166534' }}>Strong bid</span> : null}</div>
                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{p.sourcePlatform}{p.maxBid ? ` · £${p.maxBid.toLocaleString()} max bid` : ''} · {normaliseStatus(p.status)}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Actions required */}
                      <div style={panel}>
                        <div style={panelHead}><span>⚡ Actions required</span><span onClick={() => setActiveTab('tasks')} style={dashLink}>All tasks →</span></div>
                        {openTasks.length === 0 ? (
                          <div style={dashEmpty}>✓ You're all caught up — no open tasks.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {openTasks.map(t => {
                              const rd = relDate(t.dueDate);
                              const linked = t.linkedType === 'Property' && t.linkedId ? propName(t.linkedId) : '';
                              return (
                                <div key={t.id} onClick={() => setActiveTab('tasks')} style={{ display: 'flex', alignItems: 'flex-start', gap: '9px', cursor: 'pointer' }}>
                                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: rd.dot, marginTop: '5px', flexShrink: 0 }} />
                                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: '12px', color: '#0f172a' }}>{t.title}{linked ? ` — ${linked}` : ''}</div></div>
                                  <span style={{ fontSize: '11px', color: rd.color, whiteSpace: 'nowrap', flexShrink: 0 }}>{rd.txt}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Recent activity + Watchlist alerts */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={panel}>
                          <div style={panelHead}><span>🔔 Recent activity</span></div>
                          {recentActivity.length === 0 ? (
                            <div style={dashEmpty}>No activity yet.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                              {recentActivity.map((a, i) => (
                                <div key={`${a.propId}-${a.id || i}`} onClick={() => { const pr = properties.find(p => p.id === a.propId); if (pr) { setActiveTab('pipeline'); setCurrentViewProperty(pr); } }} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', cursor: 'pointer' }}>
                                  <span style={{ fontSize: '12px', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><b style={{ fontWeight: '600' }}>{a.user || 'Someone'}</b> {a.detail} · {a.propName}</span>
                                  <span style={{ fontSize: '11px', color: '#94a3b8', whiteSpace: 'nowrap', flexShrink: 0 }}>{fmtAgo(a.at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={panel}>
                          <div style={panelHead}><span>👁 Watchlist alerts</span></div>
                          {wlAlerts.length === 0 ? (
                            <div style={dashEmpty}>No watchlist alerts.</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                              {wlAlerts.map(w => (
                                <div key={w.id} onClick={() => setActiveTab('auctionintel')} style={{ fontSize: '12px', color: '#334155', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {w._kind === 'drop'
                                    ? <><span style={{ color: '#059669' }}>↓ Guide</span> {w.address} · £{(w.guidePrev / 1000).toFixed(0)}k → £{(w.guidePrice / 1000).toFixed(0)}k</>
                                    : <><span style={{ fontSize: '10px', fontWeight: '700', color: '#dc2626' }}>NEW</span> {w.address}{(w.auctionHouse || w.platform) ? ` · ${w.auctionHouse || w.platform}` : ''}{w.auctionDate ? ` · ${new Date(w.auctionDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}{w.guidePrice ? ` · £${(w.guidePrice / 1000).toFixed(0)}k` : ''}</>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  </div>
                );
              })()}

              {activeTab === 'portfolio' && (() => {
                const postStages = ['Won', 'Refurb', 'For Sale', 'Completed'];
                const fmtGBP = v => (v == null || isNaN(v)) ? '—' : `£${Math.round(v).toLocaleString()}`;
                const rows = properties.filter(p => postStages.includes(normaliseStatus(p.status))).map(p => {
                  const an = p.analytics || {};
                  const refurbKey = p.refurbLevel || 'medium';
                  const predRefurb = parseFloat(refurbKey === 'light' ? an.refurbLight : refurbKey === 'heavy' ? an.refurbHeavy : an.refurbMedium) || 0;
                  const predPurchase = parseFloat(an.targetBid) || parseFloat(an.maxBid) || p.maxBid || 0;
                  const predSale = parseFloat(an.gdvBase) || 0;
                  const predProfit = parseFloat(an.netProfit) || 0;
                  const totalInv = parseFloat(an.totalInvestment) || 0;
                  const predPremium = parseFloat(an.buyersPremium) || 0;
                  const actPurchase = p.hammerPrice || 0;
                  const actRefurb = p.actualRefurbCost || 0;
                  const actPremium = p.actualBuyersPremium || 0;
                  const actSale = p.actualSalePrice || 0;
                  const otherCosts = Math.max(0, totalInv - predPurchase - predRefurb - predPremium) + actPremium;
                  const sold = actSale > 0;
                  const actProfit = sold ? Math.round(actSale - actPurchase - (actRefurb || predRefurb) - otherCosts) : null;
                  const invested = (actPurchase || predPurchase) + (actRefurb || predRefurb);
                  const margin = sold ? (actSale ? actProfit / actSale * 100 : null) : (predSale ? predProfit / predSale * 100 : null);
                  return { p, stage: normaliseStatus(p.status), sold, predRefurb, actPurchase, actRefurb, actSale, actProfit, predProfit, invested, margin };
                });
                const capitalDeployed = rows.reduce((s, r) => s + (r.actPurchase || 0), 0);
                const realisedProfit = rows.filter(r => r.sold).reduce((s, r) => s + (r.actProfit || 0), 0);
                const projectedProfit = rows.filter(r => !r.sold).reduce((s, r) => s + (r.predProfit || 0), 0);
                const totalPredicted = rows.reduce((s, r) => s + (r.predProfit || 0), 0);
                const totalActualProj = realisedProfit + projectedProfit;
                const variance = totalActualProj - totalPredicted;
                const soldRows = rows.filter(r => r.sold);
                const avgRoi = soldRows.length ? soldRows.reduce((s, r) => s + (r.invested ? (r.actProfit / r.invested * 100) : 0), 0) / soldRows.length : null;
                const completedCount = rows.filter(r => r.stage === 'Completed' || r.sold).length;
                const inProgressCount = rows.length - completedCount;
                const pct = totalPredicted > 0 ? Math.min(100, Math.round(totalActualProj / totalPredicted * 100)) : 0;
                const tile = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 18px' };
                const tlabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' };
                const tnum = { fontSize: '24px', fontWeight: '700', marginTop: '4px' };
                const th = { textAlign: 'right', padding: '9px 12px', fontSize: '10px', textTransform: 'uppercase', color: '#64748b', fontWeight: '600' };
                const td = { textAlign: 'right', padding: '10px 12px', fontFamily: 'monospace' };
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a' }}>Portfolio P&L</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{completedCount} completed · {inProgressCount} in progress · {rows.length} deal{rows.length !== 1 ? 's' : ''} tracked</div>
                    </div>

                    {rows.length === 0 ? (
                      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                        No post-auction deals yet. Once a property reaches Exchanged, Refurb, For Sale or Completed, its P&L appears here.
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '12px' }}>
                          <div style={tile}><div style={tlabel}>Capital deployed</div><div style={{ ...tnum, color: '#0f172a' }}>{fmtGBP(capitalDeployed)}</div><div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>across {rows.filter(r => r.actPurchase).length} acquisition{rows.filter(r => r.actPurchase).length !== 1 ? 's' : ''}</div></div>
                          <div style={{ ...tile, border: '1px solid #bbf7d0', background: '#fafffe' }}><div style={tlabel}>Realised profit</div><div style={{ ...tnum, color: '#059669' }}>{fmtGBP(realisedProfit)}</div><div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{soldRows.length} deal{soldRows.length !== 1 ? 's' : ''} sold</div></div>
                          <div style={tile}><div style={tlabel}>Projected (in progress)</div><div style={{ ...tnum, color: '#0f172a' }}>{fmtGBP(projectedProfit)}</div><div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{inProgressCount} deal{inProgressCount !== 1 ? 's' : ''} · predicted</div></div>
                          <div style={tile}><div style={tlabel}>Avg ROI</div><div style={{ ...tnum, color: avgRoi != null ? '#0f172a' : '#94a3b8' }}>{avgRoi != null ? `${avgRoi.toFixed(1)}%` : '—'}</div><div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>realised deals</div></div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', marginBottom: '14px' }}>Predicted vs Actual — total profit</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}><span>Predicted</span><span style={{ fontFamily: 'monospace' }}>{fmtGBP(totalPredicted)}</span></div>
                              <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden' }}><div style={{ width: '100%', height: '100%', background: '#cbd5e1' }} /></div>
                            </div>
                            <div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', marginBottom: '4px' }}><span>Actual + projected</span><span style={{ fontFamily: 'monospace', color: variance >= 0 ? '#059669' : '#dc2626' }}>{fmtGBP(totalActualProj)} · {variance >= 0 ? '+' : '−'}{fmtGBP(Math.abs(variance))}</span></div>
                              <div style={{ height: '14px', background: '#f1f5f9', borderRadius: '7px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: '#059669' }} /></div>
                            </div>
                          </div>
                        </div>

                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
                          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', fontWeight: '600', color: '#0f172a' }}>Deal ledger</div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '640px' }}>
                              <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                  <th style={{ ...th, textAlign: 'left' }}>Deal</th>
                                  <th style={{ ...th, textAlign: 'left' }}>Stage</th>
                                  <th style={th}>Purchase</th><th style={th}>Refurb</th><th style={th}>Sale</th><th style={th}>Profit</th><th style={th}>vs Pred.</th><th style={th}>Margin</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map(r => {
                                  const ss = getStatusStyle(r.stage);
                                  const vsPred = r.sold ? (r.actProfit - r.predProfit) : null;
                                  return (
                                    <tr key={r.p.id} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(r.p); }} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#0f172a' }}>{r.p.dealName || r.p.address?.split(',')[0]}</td>
                                      <td style={{ padding: '10px 12px' }}><span style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '8px', fontWeight: '600', backgroundColor: ss.bg, color: ss.color }}>{r.stage}</span></td>
                                      <td style={td}>{fmtGBP(r.actPurchase)}</td>
                                      <td style={{ ...td, color: (r.actRefurb && r.predRefurb && r.actRefurb > r.predRefurb) ? '#d97706' : r.actRefurb ? '#0f172a' : '#94a3b8' }}>{r.actRefurb ? fmtGBP(r.actRefurb) : <>{fmtGBP(r.predRefurb)}<span style={{ fontSize: '10px' }}> est</span></>}</td>
                                      <td style={{ ...td, color: r.actSale ? '#0f172a' : '#94a3b8' }}>{r.actSale ? fmtGBP(r.actSale) : '—'}</td>
                                      <td style={{ ...td, fontWeight: '700', color: r.sold ? (r.actProfit >= 0 ? '#059669' : '#dc2626') : '#64748b' }}>{r.sold ? fmtGBP(r.actProfit) : <>{fmtGBP(r.predProfit)}<span style={{ fontSize: '10px' }}> proj</span></>}</td>
                                      <td style={{ ...td, color: vsPred == null ? '#94a3b8' : vsPred >= 0 ? '#059669' : '#dc2626' }}>{vsPred == null ? '—' : `${vsPred >= 0 ? '+' : '−'}${fmtGBP(Math.abs(vsPred))}`}</td>
                                      <td style={{ ...td, color: r.margin != null ? '#0f172a' : '#94a3b8' }}>{r.margin != null ? `${r.margin.toFixed(1)}%` : '—'}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </>
                    )}
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
                      <button onClick={() => downloadPipelineCSV(pipelineProperties)} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: '1px solid #e2e8f0', backgroundColor: '#ffffff', color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }} title="Export current view as CSV"><Download size={14} /> Export</button>
                      <button onClick={() => { setBulkMode(b => !b); setBulkSelectedIds([]); }} style={{ padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${bulkMode ? '#7C3AED' : '#e2e8f0'}`, backgroundColor: bulkMode ? '#F5F3FF' : '#ffffff', color: bulkMode ? '#7C3AED' : '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>{bulkMode ? '✕ Cancel' : '☐ Select'}</button>
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

                  {/* Bulk action bar */}
                  {bulkMode && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', backgroundColor: '#F5F3FF', border: '1px solid #ddd6fe', borderRadius: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#7C3AED' }}>{bulkSelectedIds.length} selected</span>
                      {bulkSelectedIds.length > 0 && (
                        <>
                          <select onChange={e => {
                            const stage = e.target.value;
                            if (!stage) return;
                            setProperties(prev => prev.map(p => bulkSelectedIds.includes(p.id) ? { ...withActivity(p, 'stage', `Stage changed to ${stage} (bulk)`), status: stage } : p));
                            setBulkSelectedIds([]);
                            setBulkMode(false);
                            e.target.value = '';
                          }} defaultValue="" style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #ddd6fe', fontSize: '12px', backgroundColor: '#fff', color: '#0f172a', cursor: 'pointer' }}>
                            <option value="">Move to stage…</option>
                            {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <button onClick={() => { downloadPipelineCSV(pipelineProperties.filter(p => bulkSelectedIds.includes(p.id))); }} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #ddd6fe', fontSize: '12px', backgroundColor: '#fff', color: '#475569', cursor: 'pointer', fontWeight: '600' }}>⬇ Export selected</button>
                          <button onClick={() => {
                            if (!window.confirm(`Archive ${bulkSelectedIds.length} properties? They will be hidden from the pipeline.`)) return;
                            setProperties(prev => prev.map(p => bulkSelectedIds.includes(p.id) ? { ...p, archived: true } : p));
                            setBulkSelectedIds([]);
                            setBulkMode(false);
                          }} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '12px', backgroundColor: '#fff', color: '#ef4444', cursor: 'pointer', fontWeight: '600' }}>Archive</button>
                        </>
                      )}
                      <button onClick={() => setBulkSelectedIds(pipelineProperties.map(p => p.id))} style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #ddd6fe', fontSize: '12px', backgroundColor: '#fff', color: '#7C3AED', cursor: 'pointer', marginLeft: 'auto' }}>Select all ({pipelineProperties.length})</button>
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
                              const droppedProp = properties.find(p => p.id === pid);
                              if (droppedProp && normaliseStatus(droppedProp.status) !== stage) runStageAutomation(droppedProp, stage);
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
                                <div style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', color: cols.head, padding: '4px 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{stage}</span><span style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '6px', background: cols.border, color: cols.head }}>{stageProp.length}</span>
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
                                      draggable={!bulkMode}
                                      onDragStart={e => { e.dataTransfer.setData('propId', p.id); setDraggedPropId(p.id); }}
                                      onDragEnd={() => setDraggedPropId(null)}
                                      onClick={() => { if (bulkMode) { setBulkSelectedIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]); } else { setCurrentViewProperty(p); } }}
                                      style={{ background: bulkMode && bulkSelectedIds.includes(p.id) ? '#F5F3FF' : draggedPropId === p.id ? '#f0fdf4' : '#ffffff', border: bulkMode && bulkSelectedIds.includes(p.id) ? '1.5px solid #7C3AED' : `0.5px solid ${cols.border}`, borderLeft: bulkMode && bulkSelectedIds.includes(p.id) ? '3px solid #7C3AED' : p.isStrongBid ? '3px solid #059669' : `0.5px solid ${cols.border}`, borderRadius: '7px', padding: '10px', cursor: bulkMode ? 'pointer' : 'grab', opacity: draggedPropId === p.id ? 0.5 : 1, position: 'relative' }}>
                                      {bulkMode && <div style={{ position: 'absolute', top: '8px', right: '8px', width: '16px', height: '16px', borderRadius: '4px', border: `2px solid ${bulkSelectedIds.includes(p.id) ? '#7C3AED' : '#cbd5e1'}`, background: bulkSelectedIds.includes(p.id) ? '#7C3AED' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bulkSelectedIds.includes(p.id) && <span style={{ color: '#fff', fontSize: '10px', fontWeight: '700', lineHeight: 1 }}>✓</span>}</div>}
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2px', paddingRight: bulkMode ? '22px' : '0' }}>
                                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#0f172a', flex: 1, marginRight: '4px' }}>{p.dealName || p.address.split(',')[0]}</div>
                                        {!bulkMode && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '8px', backgroundColor: getStatusStyle(stage).bg, color: getStatusStyle(stage).color, fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap' }}>{stage}</span>}
                                      </div>
                                      <div style={{ fontSize: '10px', color: '#64748b', marginBottom: '5px' }}>{p.sourcePlatform}</div>
                                      <div style={{ fontSize: '12px', fontWeight: '700', color: '#059669', marginBottom: '4px' }}>£{(p.guidePrice || 0).toLocaleString()}</div>
                                      {p.bedrooms > 0 && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.bedrooms} bed · {p.auctionDate}</div>}
                                      {!p.bedrooms && p.auctionDate && <div style={{ fontSize: '10px', color: '#94a3b8' }}>{p.auctionDate}</div>}
                                      {countdown && <div style={{ marginTop: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        {p.isStrongBid && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: '#dcfce7', color: '#166534' }}>Strong bid</span>}
                                        <span style={{ marginLeft: 'auto', fontSize: '10px', padding: '1px 6px', borderRadius: '8px', background: urgent ? '#fef2f2' : '#f1f5f9', color: urgent ? '#dc2626' : '#475569', fontWeight: '600' }}>{countdown}</span>
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
                      <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                        <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                              {bulkMode && <th style={{ padding: '12px 16px', width: '36px', textAlign: 'center' }}><input type="checkbox" checked={bulkSelectedIds.length === pipelineProperties.length && pipelineProperties.length > 0} onChange={e => setBulkSelectedIds(e.target.checked ? pipelineProperties.map(p => p.id) : [])} /></th>}
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
                              <tr key={p.id} style={{ borderBottom: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: bulkMode && bulkSelectedIds.includes(p.id) ? '#F5F3FF' : p.isStrongBid ? '#fafffe' : '#ffffff' }} onClick={() => { if (bulkMode) { setBulkSelectedIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]); } else { setCurrentViewProperty(p); } }}>
                                {bulkMode && <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={bulkSelectedIds.includes(p.id)} onChange={() => setBulkSelectedIds(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])} /></td>}
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

              {/* ==================== TAB: AUCTION REVIEW CONTROL CENTRE ==================== */}
              {activeTab === 'scraper' && (() => {
                const HOUSES = [
                  { id: 'ah_sy', name: 'Auction House South Yorkshire', shortName: 'AH S.Yorks', diaryUrl: 'https://www.auctionhouse.co.uk/southyorkshire/auction/future-auction-dates' },
                  { id: 'sdl', name: 'SDL Property Auctions', shortName: 'SDL', diaryUrl: 'https://www.sdlauctions.co.uk/property-auctions/upcoming-auctions/' },
                  { id: 'mj', name: 'Mark Jenkinson & Son', shortName: 'Mark Jenkinson', diaryUrl: 'https://www.markjenkinson.co.uk/auction-diary' },
                  { id: 'pugh', name: 'Pugh Auctions', shortName: 'Pugh', diaryUrl: 'https://www.pugh-auctions.com/auction-diary' },
                  { id: 'allsop', name: 'Allsop Residential', shortName: 'Allsop', diaryUrl: 'https://www.allsop.co.uk/auctions/property-for-auction-in-sheffield/' },
                ];
                const manualSelected = auctionSelectedDateId === 'manual';
                const selectedDate = manualSelected ? null : auctionDates.find(d => d.id === auctionSelectedDateId);
                const manualLots = auctionLots.filter(l => l.origin === 'manual');
                const visibleLots = auctionLots.filter(l => {
                  if (manualSelected) { if (l.origin !== 'manual') return false; }
                  else if (auctionSelectedDateId && l.dateId !== auctionSelectedDateId) return false;
                  if (auctionLotFilter.status !== 'all' && l.status !== auctionLotFilter.status) return false;
                  if (auctionLotFilter.type !== 'all' && l.propertyType !== auctionLotFilter.type) return false;
                  if (auctionLotFilter.search && !l.address?.toLowerCase().includes(auctionLotFilter.search.toLowerCase())) return false;
                  return true;
                });
                const datesForHouse = (houseId) => auctionDates.filter(d => d.houseId === houseId).sort((a, b) => a.auctionDate.localeCompare(b.auctionDate));
                const kpiInbox = auctionLots.filter(l => l.status === 'unreviewed' || l.isNew).length;
                const kpiShortlisted = auctionLots.filter(l => l.status === 'shortlisted').length;
                const kpiWatching = auctionLots.filter(l => l.status === 'watching').length;
                const kpiAnalysis = auctionLots.filter(l => l.status === 'deal_analysis' || l.status === 'promoted').length;
                const daysUntil = (dateStr) => {
                  if (!dateStr) return null;
                  const today = new Date(); today.setHours(0, 0, 0, 0);
                  return Math.round((new Date(dateStr + 'T00:00:00') - today) / 86400000);
                };
                const LOT_STATUS_COLORS = { unreviewed: '#e2e8f0', shortlisted: '#dcfce7', watching: '#fef9c3', rejected: '#fee2e2', deal_analysis: '#ede9fe', promoted: '#ede9fe', bid_candidate: '#dbeafe', withdrawn: '#f1f5f9', sold_prior: '#fef2f2' };
                const LOT_STATUS_TEXT_COLORS = { unreviewed: '#64748b', shortlisted: '#166534', watching: '#854d0e', rejected: '#991b1b', deal_analysis: '#6d28d9', promoted: '#6d28d9', bid_candidate: '#1e40af', withdrawn: '#64748b', sold_prior: '#64748b' };
                const LOT_STATUS_LABELS = { unreviewed: 'Unreviewed', shortlisted: 'Shortlisted', watching: 'Watching', rejected: 'Rejected', deal_analysis: 'In analysis', promoted: 'Promoted ✓', bid_candidate: 'Bid candidate', withdrawn: 'Withdrawn', sold_prior: 'Sold prior' };
                const allVisibleIds = visibleLots.map(l => l.id);
                const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => auctionSelectedLotIds.has(id));
                const colHeaders = ['Lot', 'Address', 'Type', 'Beds', 'Guide', 'Days', 'Action'];

                return (
                  <div style={{ display: 'flex', height: isMobile ? 'auto' : 'calc(100vh - 140px)', borderRadius: '12px', overflow: 'hidden', border: '0.5px solid #e2e8f0' }}>

                    {/* ── LEFT TREE PANEL ── */}
                    {!isMobile && (
                      <div style={{ width: '220px', background: '#0f172a', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #1e293b' }}>
                          <div style={{ fontSize: '10px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>Auction review</div>
                          <div style={{ display: 'flex', alignItems: 'center', background: '#1e293b', borderRadius: '6px', padding: '5px 8px', gap: '6px' }}>
                            <Search size={11} color="#475569" />
                            <span style={{ fontSize: '11px', color: '#475569' }}>Filter dates…</span>
                          </div>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
                          {auctionTabLoading && <div style={{ padding: '20px', textAlign: 'center', color: '#475569', fontSize: '11px' }}>Loading…</div>}
                          {!auctionTabLoading && HOUSES.map(house => {
                            const dates = datesForHouse(house.id);
                            if (dates.length === 0) return null;
                            return (
                              <div key={house.id}>
                                <div style={{ padding: '8px 12px 3px', fontSize: '10px', fontWeight: '500', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', borderTop: '1px solid #1e293b', marginTop: '4px' }}>{house.shortName}</div>
                                {dates.map(date => {
                                  const isActive = date.id === auctionSelectedDateId;
                                  const pct = date.totalLots ? Math.round((date.reviewedCount / date.totalLots) * 100) : 0;
                                  const isDone = date.totalLots > 0 && pct === 100;
                                  const days = daysUntil(date.auctionDate);
                                  return (
                                    <div key={date.id} onClick={() => setAuctionSelectedDateId(date.id)} style={{ padding: '7px 12px', background: isActive ? '#1e293b' : 'transparent', borderLeft: `3px solid ${isActive ? '#059669' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: '500', color: isActive ? '#f1f5f9' : '#94a3b8' }}>{new Date(date.auctionDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                                        <div style={{ fontSize: '10px', color: '#475569', marginTop: '1px' }}>{date.totalLots > 0 ? `${date.totalLots} lots · ${date.reviewedCount} done` : 'not started'}</div>
                                      </div>
                                      {date.totalLots > 0 ? (
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontSize: '10px', color: isDone ? '#059669' : '#64748b' }}>{pct}%</div>
                                          <div style={{ width: '28px', height: '3px', background: '#334155', borderRadius: '2px', marginTop: '2px', overflow: 'hidden' }}>
                                            <div style={{ width: `${pct}%`, height: '100%', background: isDone ? '#059669' : '#64748b' }}></div>
                                          </div>
                                        </div>
                                      ) : (
                                        <span style={{ fontSize: '10px', padding: '1px 5px', background: '#1e293b', color: days != null && days <= 14 ? '#f59e0b' : '#475569', borderRadius: '4px', fontWeight: '500' }}>
                                          {days != null && days <= 14 ? 'Soon' : 'Empty'}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                          {/* Manual leads / watchlist — same triage queue, manual origin */}
                          {!auctionTabLoading && (
                            <div>
                              <div style={{ padding: '8px 12px 3px', fontSize: '10px', fontWeight: '500', color: '#475569', textTransform: 'uppercase', letterSpacing: '.07em', borderTop: '1px solid #1e293b', marginTop: '4px' }}>Manual</div>
                              <div onClick={() => setAuctionSelectedDateId('manual')} style={{ padding: '7px 12px', background: manualSelected ? '#1e293b' : 'transparent', borderLeft: `3px solid ${manualSelected ? '#0ea5e9' : 'transparent'}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: manualSelected ? '#f1f5f9' : '#94a3b8' }}>📌 Watchlist / leads</div>
                                <span style={{ fontSize: '10px', padding: '1px 5px', background: '#1e293b', color: manualLots.length ? '#38bdf8' : '#475569', borderRadius: '4px', fontWeight: '500' }}>{manualLots.length}</span>
                              </div>
                            </div>
                          )}
                          {!auctionTabLoading && auctionDates.length === 0 && (
                            <div style={{ padding: '20px 14px', color: '#475569', fontSize: '11px', textAlign: 'center', lineHeight: 1.5 }}>No auction dates yet.<br />Click Scan all to discover upcoming dates.</div>
                          )}
                          {/* Links to house diaries for manual browsing */}
                          {!auctionTabLoading && (
                            <div style={{ marginTop: '12px', borderTop: '1px solid #1e293b', padding: '10px 12px' }}>
                              <div style={{ fontSize: '10px', fontWeight: '500', color: '#334155', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '6px' }}>House diaries</div>
                              {HOUSES.map(h => (
                                <a key={h.id} href={h.diaryUrl} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: '10px', color: '#475569', textDecoration: 'none', padding: '3px 0', lineHeight: 1.4 }} onMouseEnter={e => e.target.style.color = '#94a3b8'} onMouseLeave={e => e.target.style.color = '#475569'}>{h.shortName} ↗</a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '10px 12px', borderTop: '1px solid #1e293b' }}>
                          <button onClick={async () => {
                            setAuctionScanLoading(true); setAuctionScanResults(null);
                            try {
                              const token = localStorage.getItem('crm_session');
                              const res = await fetch('/api/scrape-auctions', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
                              const data = await res.json();
                              setAuctionScanResults(data.results || []);
                            } catch { setAuctionScanResults([]); }
                            setAuctionScanLoading(false);
                            await loadAuctionData();
                          }} disabled={auctionScanLoading} style={{ width: '100%', padding: '7px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: auctionScanLoading ? 'not-allowed' : 'pointer', opacity: auctionScanLoading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            <RefreshCw size={11} />
                            {auctionScanLoading ? 'Scanning…' : 'Scan all houses'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── MAIN AREA ── */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f8fafc', minWidth: 0 }}>

                      {/* KPI bar */}
                      <div style={{ padding: '8px 14px', background: '#ffffff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', gap: '16px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Inbox', value: kpiInbox, color: '#ef4444' },
                          { label: 'Shortlisted', value: kpiShortlisted, color: '#059669' },
                          { label: 'Watching', value: kpiWatching, color: '#f59e0b' },
                          { label: 'Promoted', value: kpiAnalysis, color: '#8b5cf6' },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: color, flexShrink: 0 }}></div>
                            <span style={{ fontSize: '11px', color: '#64748b' }}>{label}</span>
                            <span style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{value}</span>
                          </div>
                        ))}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <select value={auctionLotFilter.status} onChange={e => setAuctionLotFilter(f => ({ ...f, status: e.target.value }))} style={{ padding: '4px 7px', border: '0.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', background: '#fff', color: '#475569' }}>
                            <option value="all">All statuses</option>
                            <option value="unreviewed">Unreviewed</option>
                            <option value="shortlisted">Shortlisted</option>
                            <option value="watching">Watching</option>
                            <option value="rejected">Rejected</option>
                            <option value="deal_analysis">In analysis</option>
                            <option value="promoted">Promoted</option>
                          </select>
                          {isMobile && (
                            <select value={auctionSelectedDateId || ''} onChange={e => setAuctionSelectedDateId(e.target.value || null)} style={{ padding: '4px 7px', border: '0.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', background: '#fff', color: '#475569', maxWidth: '150px' }}>
                              <option value="manual">📌 Watchlist / manual</option>
                              {auctionDates.map(d => <option key={d.id} value={d.id}>{d.houseName ? d.houseName.split(' ').slice(0, 2).join(' ') + ' — ' : ''}{d.auctionDate}</option>)}
                            </select>
                          )}
                          <select value={auctionLotFilter.type} onChange={e => setAuctionLotFilter(f => ({ ...f, type: e.target.value }))} style={{ padding: '4px 7px', border: '0.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', background: '#fff', color: '#475569' }}>
                            <option value="all">All types</option>
                            <option value="Terraced">Terraced</option>
                            <option value="Semi-detached">Semi-detached</option>
                            <option value="Detached">Detached</option>
                            <option value="Flat">Flat</option>
                          </select>
                          <input value={auctionLotFilter.search} onChange={e => setAuctionLotFilter(f => ({ ...f, search: e.target.value }))} placeholder="Search address…" style={{ padding: '4px 9px', border: '0.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', width: isMobile ? '100%' : '150px' }} />
                          {isMobile && (
                            <button onClick={async () => {
                              setAuctionScanLoading(true);
                              try {
                                const token = localStorage.getItem('crm_session');
                                const res = await fetch('/api/scrape-auctions', { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } });
                                const data = await res.json();
                                setAuctionScanResults(data.results || []);
                              } catch { setAuctionScanResults([]); }
                              setAuctionScanLoading(false);
                              await loadAuctionData();
                            }} disabled={auctionScanLoading} style={{ padding: '4px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', opacity: auctionScanLoading ? 0.7 : 1 }}>
                              {auctionScanLoading ? 'Scanning…' : 'Scan'}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Selected date header */}
                      {selectedDate && (
                        <div style={{ padding: '9px 14px', background: '#ffffff', borderBottom: '0.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, flexWrap: 'wrap', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#0f172a' }}>{selectedDate.houseName} — {new Date(selectedDate.auctionDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                            <div style={{ fontSize: '10px', color: '#64748b', marginTop: '2px' }}>
                              {selectedDate.totalLots} lots · {selectedDate.reviewedCount} reviewed · {selectedDate.shortlistedCount} shortlisted
                              {(() => { const d = daysUntil(selectedDate.auctionDate); return d != null ? <span> · <strong style={{ color: d <= 7 ? '#dc2626' : '#475569' }}>{d} days away</strong></span> : null; })()}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {selectedDate.totalLots > 0 && (
                              <>
                                <div style={{ height: '5px', width: '90px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.round((selectedDate.reviewedCount / selectedDate.totalLots) * 100)}%`, background: '#059669' }}></div>
                                </div>
                                <span style={{ fontSize: '11px', color: '#64748b' }}>{Math.round((selectedDate.reviewedCount / selectedDate.totalLots) * 100)}%</span>
                              </>
                            )}
                            <a href={selectedDate.diaryUrl || HOUSES.find(h => h.id === selectedDate.houseId)?.diaryUrl} target="_blank" rel="noreferrer" style={{ padding: '5px 10px', background: '#f1f5f9', color: '#475569', border: '0.5px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', textDecoration: 'none' }}>Visit site ↗</a>
                          </div>
                        </div>
                      )}

                      {/* Manual lead entry — replaces the old Auction Intel watchlist form */}
                      {manualSelected && (
                        <div style={{ padding: '10px 14px', background: '#ffffff', borderBottom: '0.5px solid #e2e8f0', flexShrink: 0 }}>
                          <form onSubmit={e => { e.preventDefault(); if (!newWatchAddress.trim()) return; addManualLead({ address: newWatchAddress.trim(), house: newWatchPlatform, guidePrice: newWatchGuidePrice, auctionDate: newWatchAuctionDate, notes: newWatchNotes }); setNewWatchAddress(''); setNewWatchPlatform(''); setNewWatchGuidePrice(''); setNewWatchAuctionDate(''); setNewWatchNotes(''); }} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '3fr 2fr 1fr 1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                            <input type="text" placeholder="Property address" value={newWatchAddress} onChange={e => setNewWatchAddress(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                            <input type="text" placeholder="Auction house" value={newWatchPlatform} onChange={e => setNewWatchPlatform(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                            <input type="number" placeholder="Guide (£)" value={newWatchGuidePrice} onChange={e => setNewWatchGuidePrice(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                            <input type="date" value={newWatchAuctionDate} onChange={e => setNewWatchAuctionDate(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                            <input type="text" placeholder="Notes" value={newWatchNotes} onChange={e => setNewWatchNotes(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                            <button type="submit" style={{ padding: '8px 14px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add lead</button>
                          </form>
                        </div>
                      )}

                      {/* Header + rows scroll together horizontally on narrow screens since columns are fixed-width */}
                      <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }} className="crm-table-wrap">
                      {/* Column headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: '18px 46px 1fr 84px 34px 78px 50px 108px', padding: '7px 14px', background: '#f8fafc', borderBottom: '0.5px solid #e2e8f0', flexShrink: 0, alignItems: 'center', minWidth: '560px' }}>
                        <input type="checkbox" checked={allSelected} onChange={() => allSelected ? setAuctionSelectedLotIds(new Set()) : setAuctionSelectedLotIds(new Set(allVisibleIds))} style={{ width: '13px', height: '13px' }} />
                        {colHeaders.map((h, i) => (
                          <div key={h} style={{ fontSize: '10px', fontWeight: '500', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: i >= 3 ? 'center' : 'left' }}>{h}</div>
                        ))}
                      </div>

                      {/* Lot rows */}
                      <div style={{ flex: 1, overflowY: 'auto', minWidth: '560px' }}>
                        {auctionTabLoading && <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>Loading lots…</div>}
                        {!auctionTabLoading && visibleLots.length === 0 && (
                          <div style={{ padding: '60px 40px', textAlign: 'center', color: '#94a3b8' }}>
                            <Gavel size={28} style={{ marginBottom: '10px', opacity: 0.3 }} />
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>{manualSelected ? 'No manual leads yet' : auctionSelectedDateId ? 'No lots for this date' : 'Select an auction date'}</div>
                            <div style={{ fontSize: '11px', marginTop: '4px' }}>{manualSelected ? 'Add a lead above to start watching it' : auctionSelectedDateId ? 'Scan or manually add lots to get started' : 'Pick a date in the left panel to see lots'}</div>
                          </div>
                        )}
                        {!auctionTabLoading && visibleLots.map(lot => {
                          const isSelected = auctionSelectedLotIds.has(lot.id);
                          const days = daysUntil(lot.auctionDate);
                          const isInactive = lot.status === 'rejected' || lot.isWithdrawn;
                          const rowBg = isSelected ? '#f0f9ff' : lot.isNew && lot.status === 'unreviewed' ? '#fffbeb' : lot.status === 'shortlisted' ? '#f0fdf4' : lot.guidePriceChanged ? '#fff7f0' : '#ffffff';
                          return (
                            <div key={lot.id} style={{ display: 'grid', gridTemplateColumns: '18px 46px 1fr 84px 34px 78px 50px 108px', padding: '8px 14px', borderBottom: '0.5px solid #f1f5f9', background: rowBg, alignItems: 'center', opacity: isInactive ? 0.5 : 1, minWidth: '560px' }}>
                              <input type="checkbox" checked={isSelected} onChange={() => setAuctionSelectedLotIds(prev => { const n = new Set(prev); n.has(lot.id) ? n.delete(lot.id) : n.add(lot.id); return n; })} style={{ width: '13px', height: '13px' }} />
                              <div style={{ fontSize: '11px', fontWeight: '500', color: '#475569' }}>{lot.lotNumber || '—'}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: '12px', fontWeight: '500', color: isInactive ? '#94a3b8' : '#0f172a', textDecoration: isInactive ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {lot.address}
                                  {lot.isNew && lot.status === 'unreviewed' && <span style={{ fontSize: '10px', padding: '1px 4px', background: '#fef3c7', color: '#92400e', borderRadius: '4px', fontWeight: '500', marginLeft: '4px' }}>New</span>}
                                  {lot.guidePriceChanged && <span style={{ fontSize: '10px', padding: '1px 4px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontWeight: '500', marginLeft: '4px' }}>Price</span>}
                                  {lot.isWithdrawn && <span style={{ fontSize: '10px', padding: '1px 4px', background: '#f1f5f9', color: '#64748b', borderRadius: '4px', fontWeight: '500', marginLeft: '4px' }}>Withdrawn</span>}
                                </div>
                                {lot.previousGuidePrice && <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '1px' }}>was £{Number(lot.previousGuidePrice).toLocaleString()}</div>}
                              </div>
                              <div style={{ fontSize: '11px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lot.propertyType || '—'}</div>
                              <div style={{ fontSize: '12px', color: '#475569', textAlign: 'center' }}>{lot.bedrooms || '—'}</div>
                              <div style={{ fontSize: '12px', fontWeight: '500', color: lot.guidePriceChanged ? '#059669' : '#0f172a', textAlign: 'right' }}>{lot.guidePrice ? `£${Number(lot.guidePrice).toLocaleString()}` : '—'}</div>
                              <div style={{ fontSize: '11px', color: days != null && days <= 7 ? '#dc2626' : '#64748b', textAlign: 'center', fontWeight: days != null && days <= 7 ? '500' : '400' }}>{days != null ? days : '—'}</div>
                              <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                {(lot.status === 'unreviewed' || lot.status === 'viewed') && (
                                  <>
                                    <button onClick={() => triageLot(lot.id, 'shortlisted')} title="Shortlist (S)" style={{ padding: '3px 6px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>S</button>
                                    <button onClick={() => triageLot(lot.id, 'watching')} title="Watch (W)" style={{ padding: '3px 6px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>W</button>
                                    <button onClick={() => triageLot(lot.id, 'rejected')} title="Reject" style={{ padding: '3px 5px', background: '#f1f5f9', color: '#475569', border: '0.5px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                                    {lot.lotUrl && <a href={lot.lotUrl} target="_blank" rel="noreferrer" style={{ padding: '3px 5px', background: '#f1f5f9', color: '#475569', border: '0.5px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', textDecoration: 'none' }}>↗</a>}
                                  </>
                                )}
                                {lot.status === 'shortlisted' && (
                                  <>
                                    <button onClick={() => sendLotToPipeline(lot)} style={{ padding: '3px 7px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Pipeline →</button>
                                    <button onClick={() => triageLot(lot.id, 'rejected')} title="Reject" style={{ padding: '3px 5px', background: '#f1f5f9', color: '#94a3b8', border: '0.5px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                                  </>
                                )}
                                {lot.status === 'watching' && (
                                  <>
                                    <button onClick={() => sendLotToPipeline(lot)} title="Promote to pipeline" style={{ padding: '3px 7px', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>Pipeline →</button>
                                    <button onClick={() => triageLot(lot.id, 'shortlisted')} title="Shortlist" style={{ padding: '3px 5px', background: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>S</button>
                                    <button onClick={() => triageLot(lot.id, 'rejected')} title="Reject" style={{ padding: '3px 5px', background: '#f1f5f9', color: '#94a3b8', border: '0.5px solid #e2e8f0', borderRadius: '4px', fontSize: '10px', cursor: 'pointer' }}>✕</button>
                                  </>
                                )}
                                {lot.status !== 'unreviewed' && lot.status !== 'viewed' && lot.status !== 'shortlisted' && lot.status !== 'watching' && (
                                  <span style={{ fontSize: '10px', padding: '2px 7px', background: LOT_STATUS_COLORS[lot.status] || '#f1f5f9', color: LOT_STATUS_TEXT_COLORS[lot.status] || '#475569', borderRadius: '10px', fontWeight: '500', whiteSpace: 'nowrap' }}>{LOT_STATUS_LABELS[lot.status] || lot.status}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      </div>

                      {/* Bulk actions bar */}
                      {auctionSelectedLotIds.size > 0 && (
                        <div style={{ padding: '8px 14px', background: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>{auctionSelectedLotIds.size} selected</span>
                          <button onClick={() => triageBulk(auctionSelectedLotIds, 'shortlisted')} style={{ padding: '4px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>Shortlist all</button>
                          <button onClick={() => triageBulk(auctionSelectedLotIds, 'watching')} style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>Watch all</button>
                          <button onClick={() => triageBulk(auctionSelectedLotIds, 'rejected')} style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>Reject all</button>
                          <button onClick={() => setAuctionSelectedLotIds(new Set())} style={{ padding: '4px 10px', background: 'transparent', color: '#94a3b8', border: '0.5px solid #334155', borderRadius: '5px', fontSize: '11px', cursor: 'pointer' }}>Clear</button>
                          <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#475569' }}>S = shortlist · W = watch · ✕ = reject</div>
                        </div>
                      )}

                      {/* Scan result banner */}
                      {auctionScanResults && auctionScanResults.length > 0 && auctionSelectedLotIds.size === 0 && (
                        <div style={{ padding: '7px 14px', background: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', color: '#64748b' }}>Last scan:</span>
                          {auctionScanResults.map((r, i) => (
                            <span key={i} style={{ fontSize: '10px', padding: '2px 7px', background: r.error ? '#f59e0b20' : '#05966920', color: r.error ? '#f59e0b' : '#4ade80', borderRadius: '5px' }}>
                              {r.name?.split(' ').slice(0, 2).join(' ')}: {r.error ? 'blocked' : `~${r.estimatedLots || 0} lots`}
                            </span>
                          ))}
                          <button onClick={() => setAuctionScanResults(null)} style={{ marginLeft: 'auto', fontSize: '11px', color: '#475569', background: 'transparent', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
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
                        <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '640px' }}>
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
                      <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '760px' }}>
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
                                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 2fr 1.5fr 2fr 1.5fr auto', gap: '8px', alignItems: 'end' }}>
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
                                        <form onSubmit={(e) => handleLogJob(e, s.id)} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
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
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px' }}>
                      {[
                        ['Total lots tracked', properties.length, '#0f172a'],
                        ['Strong bid opportunities', properties.filter(p => p.isStrongBid).length, '#059669'],
                        ['Won', properties.filter(p => normaliseStatus(p.status) === 'Won').length, '#065f46'],
                        ['Watching / shortlisted', auctionLots.filter(l => l.status === 'watching' || l.status === 'shortlisted').length + watchlist.length, '#1d4ed8'],
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
                            const wonC = lots.filter(p => normaliseStatus(p.status) === 'Won').length;
                            const strongC = lots.filter(p => p.isStrongBid).length;
                            return (
                              <div key={pl} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: isMobile ? '80px' : '140px', fontSize: '12px', fontWeight: '500', color: '#0f172a', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl}</div>
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

                    {/* Watchlist now lives in the unified Auction Triage queue */}
                    <div onClick={() => { setActiveTab('scraper'); setAuctionSelectedDateId('manual'); }} style={{ backgroundColor: '#f0f9ff', padding: '14px 16px', borderRadius: '10px', border: '1px solid #bae6fd', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <Bookmark size={16} color="#0369a1" />
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: '#0369a1' }}>The watchlist has moved to Auction Triage</div>
                        <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>Scraped lots and manual leads now live in one triage queue — click to open it</div>
                      </div>
                      <span style={{ padding: '6px 12px', background: '#0369a1', color: '#fff', borderRadius: '6px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap' }}>Open triage →</span>
                    </div>

                    {/* Bidding Performance Analytics */}
                    {(() => {
                      const completed = properties.filter(p => ['Won', 'Lost'].includes(normaliseStatus(p.status)));
                      if (completed.length === 0) return null;
                      const won = completed.filter(p => normaliseStatus(p.status) === 'Won');
                      const outbid = completed.filter(p => getBidResult(p) === 'outbid');
                      const noBid = completed.filter(p => getBidResult(p) === 'no_bid');
                      const winRate = Math.round(won.length / completed.length * 100);
                      const byPlatform = {};
                      properties.forEach(p => {
                        if (!p.sourcePlatform) return;
                        if (!byPlatform[p.sourcePlatform]) byPlatform[p.sourcePlatform] = { name: p.sourcePlatform, total: 0, won: 0, outbid: 0, noBid: 0, active: 0 };
                        byPlatform[p.sourcePlatform].total++;
                        const ns = normaliseStatus(p.status);
                        if (ns === 'Won') byPlatform[p.sourcePlatform].won++;
                        else if (ns === 'Lost' && getBidResult(p) === 'no_bid') byPlatform[p.sourcePlatform].noBid++;
                        else if (ns === 'Lost') byPlatform[p.sourcePlatform].outbid++;
                        else byPlatform[p.sourcePlatform].active++;
                      });
                      const platformRows = Object.values(byPlatform).sort((a, b) => b.total - a.total);
                      return (
                        <>
                          <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Bidding performance</div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
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
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', flexShrink: 0, backgroundColor: normaliseStatus(p.status) === 'Won' ? '#dcfce7' : getBidResult(p) === 'outbid' ? '#fef3c7' : '#f1f5f9', color: normaliseStatus(p.status) === 'Won' ? '#166534' : getBidResult(p) === 'outbid' ? '#92400e' : '#475569' }}>{normaliseStatus(p.status)}{normaliseStatus(p.status) === 'Lost' && getBidResult(p) === 'no_bid' ? ' (no bid)' : ''}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Guide vs hammer price analysis */}
                          {(() => {
                            const sold = properties.filter(p => normaliseStatus(p.status) === 'Won' && p.hammerPrice > 0 && p.guidePrice > 0);
                            if (sold.length === 0) return null;
                            const deltas = sold.map(p => ({ p, pct: (p.hammerPrice - p.guidePrice) / p.guidePrice * 100 }));
                            const overGuide = deltas.filter(d => d.pct > 0);
                            const atOrUnder = deltas.filter(d => d.pct <= 0);
                            const avgOver = deltas.reduce((s, d) => s + d.pct, 0) / deltas.length;
                            const maxOver = Math.max(...deltas.map(d => d.pct));
                            return (
                              <div style={{ backgroundColor: '#ffffff', padding: '18px 20px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '14px' }}>Guide vs hammer price</div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
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
                              <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '520px' }}>
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
                            </div>
                          )}
                        </>
                      );
                    })()}

                    {watchlist.length > 0 && (
                      <div style={{ backgroundColor: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                        <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '700px' }}>
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
                                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '3fr 2fr 1fr 1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                                        <input value={editWatchAddress} onChange={e => setEditWatchAddress(e.target.value)} placeholder="Address" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input value={editWatchPlatform} onChange={e => setEditWatchPlatform(e.target.value)} placeholder="Auction house" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input type="number" value={editWatchGuidePrice} onChange={e => setEditWatchGuidePrice(e.target.value)} placeholder="Guide (£)" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input type="date" value={editWatchDate} onChange={e => setEditWatchDate(e.target.value)} style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <input value={editWatchNotes} onChange={e => setEditWatchNotes(e.target.value)} placeholder="Notes" style={{ padding: '7px 9px', border: '1px solid #fde68a', borderRadius: '6px', fontSize: '12px' }} />
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                          <button onClick={() => { setWatchlist(watchlist.map(w => { if (w.id !== item.id) return w; const newGuide = parseFloat(editWatchGuidePrice) || 0; const dropped = w.guidePrice && newGuide && newGuide < w.guidePrice; return { ...w, address: editWatchAddress, auctionHouse: editWatchPlatform, platform: editWatchPlatform, guidePrice: newGuide, auctionDate: editWatchDate, notes: editWatchNotes, ...(dropped ? { guidePrev: w.guidePrice, guideChangedAt: new Date().toISOString() } : {}) }; })); setEditingWatchlistId(null); }} style={{ padding: '7px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Save</button>
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
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: COMPANIES (Option C) ==================== */}
              {activeTab === 'companies' && (() => {
                const linkedContacts = currentViewCompany ? contacts.filter(c => c.companyId === currentViewCompany.id) : [];
                const linkedProps = currentViewCompany ? properties.filter(p => p.sourcePlatform === currentViewCompany.name || (p.linkedCompanyIds || []).includes(currentViewCompany.id)) : [];
                const unlinkedProps = currentViewCompany ? properties.filter(p => p.sourcePlatform !== currentViewCompany.name && !(p.linkedCompanyIds || []).includes(currentViewCompany.id)) : [];
                const typeColour = (t) => ({ 'Auction House': { bg: '#dcfce7', color: '#166534' }, 'Solicitor': { bg: '#eff6ff', color: '#1d4ed8' }, 'Surveyor': { bg: '#fff7ed', color: '#c2410c' }, 'Builder': { bg: '#f5f3ff', color: '#6d28d9' }, 'Estate Agent': { bg: '#f0f9ff', color: '#0369a1' } }[t] || { bg: '#f1f5f9', color: '#475569' });
                const arrowGray = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%2394a3b8' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")";
                const arrowGreen = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5' viewBox='0 0 8 5'%3E%3Cpath d='M1 1l3 3 3-3' stroke='%23059669' stroke-width='1.3' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")";
                const lp = (on) => ({ display: 'inline-flex', alignItems: 'center', height: '24px', border: '0.5px solid ' + (on ? '#059669' : '#e2e8f0'), borderRadius: '20px', background: on ? '#f0fdf4' : '#fff', overflow: 'hidden', flexShrink: 0 });
                const ll = (on) => ({ fontSize: '10px', color: on ? '#059669' : '#94a3b8', padding: '0 0 0 8px', whiteSpace: 'nowrap', pointerEvents: 'none' });
                const ls = (on) => ({ WebkitAppearance: 'none', appearance: 'none', border: 'none', background: 'none', fontSize: '11px', color: on ? '#059669' : '#475569', height: '24px', padding: '0 18px 0 3px', cursor: 'pointer', outline: 'none', backgroundImage: on ? arrowGreen : arrowGray, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 5px center' });
                const anyCoFilter = companySort !== 'newest' || companySearchType !== 'ALL' || companySearchTier !== 'ALL' || companySearchCity !== 'ALL' || companyHasContacts !== 'ANY' || companyHasProperties !== 'ANY' || companyPropCount !== 'ANY' || companyLastActivity !== 'ANY' || companyDateAdded !== 'ANY' || !!companySearchQuery || companyQuickKeyRel || companyQuickInactive || companyQuickOpenProps;
                const clearCoFilters = () => { setCompanySort('newest'); setCompanySearchType('ALL'); setCompanySearchTier('ALL'); setCompanySearchCity('ALL'); setCompanyHasContacts('ANY'); setCompanyHasProperties('ANY'); setCompanyPropCount('ANY'); setCompanyLastActivity('ANY'); setCompanyDateAdded('ANY'); setCompanySearchQuery(''); setCompanyQuickKeyRel(false); setCompanyQuickInactive(false); setCompanyQuickOpenProps(false); };
                return (
                  <div style={{ display: 'flex', gap: '0', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, flex: '1 1 0', overflow: 'hidden', backgroundColor: '#ffffff', borderRadius: isMobile ? '8px' : '12px', border: '1px solid #e2e8f0' }}>
                    {/* Left list */}
                    <div style={{ width: isMobile ? '100%' : '260px', maxHeight: isMobile ? (currentViewCompany ? '0' : '100%') : 'none', overflow: isMobile ? 'hidden' : 'visible', display: isMobile && currentViewCompany ? 'none' : 'flex', borderRight: isMobile ? 'none' : '1px solid #e2e8f0', borderBottom: isMobile ? '1px solid #e2e8f0' : 'none', flexDirection: 'column', flexShrink: 0 }}>
                      <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <div style={{ position: 'relative' }}>
                          <Search size={13} style={{ position: 'absolute', top: '9px', left: '9px', color: '#94a3b8' }} />
                          <input placeholder="Search companies..." value={companySearchQuery} onChange={e => setCompanySearchQuery(e.target.value)} style={{ width: '100%', padding: '7px 7px 7px 28px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: '1px' }}>
                          <div style={lp(companySort !== 'newest')}>
                            <span style={ll(companySort !== 'newest')}>Sort:</span>
                            <select value={companySort} onChange={e => setCompanySort(e.target.value)} style={ls(companySort !== 'newest')}>
                              <option value="newest">Newest</option>
                              <option value="oldest">Oldest</option>
                              <option value="az">A–Z</option>
                              <option value="za">Z–A</option>
                              <option value="most-props">Most props</option>
                              <option value="most-cons">Most contacts</option>
                              <option value="last-act">Last active</option>
                              <option value="dormant">Dormant</option>
                            </select>
                          </div>
                          <div style={lp(companySearchType !== 'ALL')}>
                            <span style={ll(companySearchType !== 'ALL')}>Type:</span>
                            <select value={companySearchType} onChange={e => setCompanySearchType(e.target.value)} style={ls(companySearchType !== 'ALL')}>
                              <option value="ALL">All</option>
                              <option value="Auction House">Auction House</option>
                              <option value="Solicitor">Solicitor</option>
                              <option value="Surveyor">Surveyor</option>
                              <option value="Builder">Builder</option>
                              <option value="Estate Agent">Estate Agent</option>
                              <option value="Mortgage Broker">Mortgage Broker</option>
                              <option value="Letting Agent">Letting Agent</option>
                              <option value="Architect">Architect</option>
                              <option value="Trade / Contractor">Trade / Contractor</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          <div style={lp(companySearchTier !== 'ALL')}>
                            <span style={ll(companySearchTier !== 'ALL')}>Tier:</span>
                            <select value={companySearchTier} onChange={e => setCompanySearchTier(e.target.value)} style={ls(companySearchTier !== 'ALL')}>
                              <option value="ALL">Any</option>
                              <option value="Gold">Gold</option>
                              <option value="Silver">Silver</option>
                              <option value="Bronze">Bronze</option>
                              <option value="none">None</option>
                            </select>
                          </div>
                          <div style={lp(companySearchCity !== 'ALL')}>
                            <span style={ll(companySearchCity !== 'ALL')}>City:</span>
                            <select value={companySearchCity} onChange={e => setCompanySearchCity(e.target.value)} style={ls(companySearchCity !== 'ALL')}>
                              <option value="ALL">Any</option>
                              {[...new Set(companies.map(c => c.city).filter(v => v && v !== '--'))].sort().map(city => <option key={city} value={city}>{city}</option>)}
                            </select>
                          </div>
                          <div style={lp(companyHasContacts !== 'ANY')}>
                            <span style={ll(companyHasContacts !== 'ANY')}>Contacts:</span>
                            <select value={companyHasContacts} onChange={e => setCompanyHasContacts(e.target.value)} style={ls(companyHasContacts !== 'ANY')}>
                              <option value="ANY">Any</option>
                              <option value="yes">Has contacts</option>
                              <option value="no">No contacts</option>
                            </select>
                          </div>
                          <div style={lp(companyHasProperties !== 'ANY')}>
                            <span style={ll(companyHasProperties !== 'ANY')}>Props:</span>
                            <select value={companyHasProperties} onChange={e => setCompanyHasProperties(e.target.value)} style={ls(companyHasProperties !== 'ANY')}>
                              <option value="ANY">Any</option>
                              <option value="yes">Has properties</option>
                              <option value="no">No properties</option>
                            </select>
                          </div>
                          <div style={lp(companyPropCount !== 'ANY')}>
                            <span style={ll(companyPropCount !== 'ANY')}>Count:</span>
                            <select value={companyPropCount} onChange={e => setCompanyPropCount(e.target.value)} style={ls(companyPropCount !== 'ANY')}>
                              <option value="ANY">Any</option>
                              <option value="0">0 props</option>
                              <option value="1-2">1–2 props</option>
                              <option value="3+">3+ props</option>
                            </select>
                          </div>
                          <div style={lp(companyLastActivity !== 'ANY')}>
                            <span style={ll(companyLastActivity !== 'ANY')}>Activity:</span>
                            <select value={companyLastActivity} onChange={e => setCompanyLastActivity(e.target.value)} style={ls(companyLastActivity !== 'ANY')}>
                              <option value="ANY">Any</option>
                              <option value="7d">Last 7 days</option>
                              <option value="30d">Last 30 days</option>
                              <option value="90d">Last 90 days</option>
                              <option value="over90">Over 90 days</option>
                              <option value="never">Never logged</option>
                            </select>
                          </div>
                          <div style={lp(companyDateAdded !== 'ANY')}>
                            <span style={ll(companyDateAdded !== 'ANY')}>Added:</span>
                            <select value={companyDateAdded} onChange={e => setCompanyDateAdded(e.target.value)} style={ls(companyDateAdded !== 'ANY')}>
                              <option value="ANY">Any</option>
                              <option value="7d">Last 7 days</option>
                              <option value="30d">Last 30 days</option>
                              <option value="90d">Last 90 days</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                          {[
                            [companyQuickKeyRel, setCompanyQuickKeyRel, '★ Key relationships'],
                            [companyQuickInactive, setCompanyQuickInactive, '⏸ Inactive 30d+'],
                            [companyQuickOpenProps, setCompanyQuickOpenProps, '🏠 Open properties'],
                          ].map(([active, setter, label]) => (
                            <button key={label} onClick={() => setter(!active)} style={{ display: 'inline-flex', alignItems: 'center', height: '24px', padding: '0 9px', border: '0.5px solid ' + (active ? '#059669' : '#e2e8f0'), borderRadius: '20px', fontSize: '11px', backgroundColor: active ? '#f0fdf4' : '#fff', color: active ? '#059669' : '#64748b', cursor: 'pointer', flexShrink: 0 }}>{label}</button>
                          ))}
                          <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{filteredCompanies.length} record{filteredCompanies.length !== 1 ? 's' : ''}</span>
                          {anyCoFilter && (
                            <button onClick={clearCoFilters} style={{ fontSize: '10px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0', whiteSpace: 'nowrap' }}>Clear filters</button>
                          )}
                        </div>
                      </div>
                      <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredCompanies.map(c => {
                          const tc = typeColour(c.type);
                          const conCount = contacts.filter(con => con.companyId === c.id).length;
                          const propCount = properties.filter(p => (p.linkedCompanyIds || []).includes(c.id)).length;
                          const lastNote = globalNotes.filter(n => n.targetType === 'Company' && n.targetId === c.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date || '';
                          const isRecent = lastNote && Math.floor((new Date() - new Date(lastNote)) / 86400000) <= 7;
                          return (
                            <div key={c.id} onClick={() => { setCurrentViewCompany(c); setCompanyDetailTab('overview'); }} style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', backgroundColor: currentViewCompany?.id === c.id ? '#f0fdf4' : '#ffffff', borderLeft: currentViewCompany?.id === c.id ? '3px solid #059669' : '3px solid transparent' }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                                {c.tier && <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: c.tier === 'Gold' ? '#fef3c7' : c.tier === 'Silver' ? '#f1f5f9' : '#fdf6ec', color: c.tier === 'Gold' ? '#92400e' : c.tier === 'Silver' ? '#475569' : '#9a3412', fontWeight: '600', flexShrink: 0 }}>{c.tier}</span>}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '3px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: tc.bg, color: tc.color, fontWeight: '600' }}>{c.type}</span>
                                {conCount > 0 && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{conCount} con</span>}
                                {propCount > 0 && <span style={{ fontSize: '10px', color: '#94a3b8' }}>{propCount} prop{propCount !== 1 ? 's' : ''}</span>}
                              </div>
                              {lastNote && <div style={{ fontSize: '10px', color: isRecent ? '#059669' : '#94a3b8', marginTop: '2px' }}>{isRecent ? '● ' : ''}{lastNote}</div>}
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
                              <option value="Trade / Contractor">Trade / Contractor</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>
                          {newCompType === 'Auction House' && (
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
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
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '14px' }}>
                                    <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '18px' }}>
                                      <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '14px' }}>Company details</div>
                                      <Field label="Company name" field="name" placeholder="e.g. Allsop LLP" />
                                      <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Type</label>
                                        <select value={currentViewCompany.type || ''} onChange={e => updateCompanyField('type', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}>
                                          {['Auction House','Solicitor','Surveyor','Builder','Estate Agent','Mortgage Broker','Letting Agent','Architect','Trade / Contractor','Other'].map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                      </div>
                                      <div style={{ marginBottom: '14px' }}>
                                        <label style={{ display: 'block', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '5px' }}>Tier / relationship</label>
                                        <select value={currentViewCompany.tier || ''} onChange={e => updateCompanyField('tier', e.target.value)} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', backgroundColor: '#fff' }}>
                                          <option value="">— None —</option>
                                          <option value="Gold">Gold</option>
                                          <option value="Silver">Silver</option>
                                          <option value="Bronze">Bronze</option>
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
                                        <div style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: '600', marginBottom: '12px' }}>Activity notes</div>
                                        {globalNotes.filter(n => n.targetType === 'Company' && n.targetId === currentViewCompany.id).sort((a, b) => b.date.localeCompare(a.date)).map(n => (
                                          <div key={n.id} style={{ padding: '8px 10px', backgroundColor: NOTE_TYPE_BG[n.type] || '#f8fafc', border: '1px solid ' + (NOTE_TYPE_COLORS[n.type] ? NOTE_TYPE_COLORS[n.type] + '33' : '#e2e8f0'), borderRadius: '6px', marginBottom: '6px', position: 'relative' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                              <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: NOTE_TYPE_COLORS[n.type] || '#94a3b8', color: '#fff', fontWeight: '600' }}>{n.type}</span>
                                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{n.date} · {n.author}</span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: NOTE_TYPE_TEXT[n.type] || '#0f172a' }}>{n.text}</div>
                                            <button onClick={() => setGlobalNotes(globalNotes.filter(x => x.id !== n.id))} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', lineHeight: 1 }}>✕</button>
                                          </div>
                                        ))}
                                        {globalNotes.filter(n => n.targetType === 'Company' && n.targetId === currentViewCompany.id).length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>No activity notes yet</div>}
                                        <form onSubmit={e => handleAddUnifiedNote(e, 'Company', currentViewCompany.id)} style={{ marginTop: '8px' }}>
                                          <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Log a call, meeting, email or note…" rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
                                          <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                            <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                                              <option value="Call">📞 Call</option>
                                              <option value="Meeting">🤝 Meeting</option>
                                              <option value="Email">✉️ Email</option>
                                              <option value="Review">📋 Review</option>
                                              <option value="Task">✅ Task</option>
                                              <option value="Flag">🚩 Flag</option>
                                            </select>
                                            <button type="submit" style={{ padding: '6px 14px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>Log</button>
                                          </div>
                                        </form>
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
                              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b' }}>{linkedContacts.length} contact{linkedContacts.length !== 1 ? 's' : ''}</span>
                                <button onClick={() => { setNewConCompanyId(String(currentViewCompany.id)); setActiveTab('contacts'); setCurrentViewContact({ _new: true }); }} style={{ padding: '5px 12px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>+ Add contact</button>
                              </div>
                              {linkedContacts.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts linked to this company</div> : (
                                <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '520px' }}>
                                  <thead><tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Name</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Job Title</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Email</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Phone</th></tr></thead>
                                  <tbody>{linkedContacts.map(c => <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}><td style={{ padding: '10px 14px', fontWeight: '600', color: '#0f172a' }}>{c.name}</td><td style={{ padding: '10px 14px', color: '#64748b' }}>{c.jobTitle}</td><td style={{ padding: '10px 14px', color: '#475569' }}>{c.email}</td><td style={{ padding: '10px 14px', color: '#475569' }}>{c.phone !== '--' ? c.phone : '—'}</td></tr>)}</tbody>
                                </table>
                                </div>
                              )}
                            </div>
                          )}
                          {companyDetailTab === 'properties' && (
                            <div>
                              {/* Link a property */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Link a property:</span>
                                <select value="" onChange={e => { const pid = parseInt(e.target.value); if (pid) togglePropertyCompanyLink(pid, currentViewCompany.id, true); }} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', backgroundColor: '#fff', minWidth: isMobile ? '140px' : '220px' }}>
                                  <option value="">Select a property…</option>
                                  {unlinkedProps.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                                </select>
                                {unlinkedProps.length === 0 && <span style={{ fontSize: '11px', color: '#94a3b8' }}>All properties already linked</span>}
                              </div>
                              <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                                {linkedProps.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No properties linked to this company yet — use the picker above or add it as the source platform.</div> : (
                                  <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '620px' }}>
                                    <thead><tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Address</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Link</th><th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Status</th><th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Guide</th><th style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '600', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' }}>Auction date</th><th style={{ padding: '10px 14px' }}></th></tr></thead>
                                    <tbody>{linkedProps.map(p => {
                                      const isManual = (p.linkedCompanyIds || []).includes(currentViewCompany.id);
                                      const isPlatform = p.sourcePlatform === currentViewCompany.name;
                                      return (
                                        <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                          <td style={{ padding: '10px 14px', fontWeight: '600', color: '#0284c7', cursor: 'pointer' }} onClick={() => { setActiveTab('pipeline'); setCurrentViewProperty(p); }}>{p.address}</td>
                                          <td style={{ padding: '10px 14px' }}>{isPlatform ? <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600', backgroundColor: '#dcfce7', color: '#166534' }}>Source platform</span> : <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600', backgroundColor: '#ede9fe', color: '#6d28d9' }}>Linked</span>}</td>
                                          <td style={{ padding: '10px 14px' }}><span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', fontWeight: '600', backgroundColor: getStatusStyle(p.status || 'Sourced').bg, color: getStatusStyle(p.status || 'Sourced').color }}>{p.status || 'Sourced'}</span></td>
                                          <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: '600' }}>£{p.guidePrice?.toLocaleString()}</td>
                                          <td style={{ padding: '10px 14px', textAlign: 'center', color: '#64748b' }}>{p.auctionDate}</td>
                                          <td style={{ padding: '10px 14px', textAlign: 'center' }}>{isManual && <button onClick={() => togglePropertyCompanyLink(p.id, currentViewCompany.id, false)} title="Unlink" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '11px', fontWeight: '600' }}>Unlink</button>}</td>
                                        </tr>
                                      );
                                    })}</tbody>
                                  </table>
                                  </div>
                                )}
                              </div>
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
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <Search size={13} style={{ position: 'absolute', top: '9px', left: '9px', color: '#94a3b8' }} />
                          <input placeholder="Search contacts..." value={contactSearchQuery} onChange={e => setContactSearchQuery(e.target.value)} style={{ width: '100%', padding: '7px 7px 7px 28px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', backgroundColor: '#f8fafc' }} />
                        </div>
                        {!isMobile && (<>
                          <select value={contactSort} onChange={e => setContactSort(e.target.value)} style={{ padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                            <option value="newest">Newest</option>
                            <option value="az">A–Z</option>
                            <option value="za">Z–A</option>
                            <option value="last-act">Last active</option>
                            <option value="dormant">Dormant</option>
                          </select>
                          <select value={contactSearchRole} onChange={e => setContactSearchRole(e.target.value)} style={{ padding: '7px 8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                            <option value="ALL">Any role</option>
                            <option value="Agent">Agent</option>
                            <option value="Solicitor">Solicitor</option>
                            <option value="Surveyor">Surveyor</option>
                            <option value="Contractor">Contractor</option>
                            <option value="Broker">Broker</option>
                            <option value="Investor">Investor</option>
                            <option value="Other">Other</option>
                          </select>
                          <button onClick={() => setContactShowMoreFilters(!contactShowMoreFilters)} style={{ padding: '7px 10px', border: '1px solid ' + (contactShowMoreFilters || contactSearchCompany !== 'ALL' || contactSearchCoType !== 'ALL' || contactHasNotes !== 'ANY' || contactLastActivity !== 'ANY' || contactDateAdded !== 'ANY' || contactSearchOrigin !== 'ALL' || contactQuickActiveMonth ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactShowMoreFilters ? '#f0fdf4' : '#fff', color: contactShowMoreFilters ? '#059669' : '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>{'⊞' + (contactSearchCompany !== 'ALL' || contactSearchCoType !== 'ALL' || contactHasNotes !== 'ANY' || contactLastActivity !== 'ANY' || contactDateAdded !== 'ANY' || contactSearchOrigin !== 'ALL' || contactQuickActiveMonth ? ' ●' : '')}</button>
                        </>)}
                        <button onClick={() => setCurrentViewContact({ _new: true })} style={{ padding: '7px 14px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>+ New contact</button>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>{filteredContacts.length} record{filteredContacts.length !== 1 ? 's' : ''}</span>
                        {(contactSort !== 'newest' || contactSearchRole !== 'ALL' || contactSearchCompany !== 'ALL' || contactSearchCoType !== 'ALL' || contactHasNotes !== 'ANY' || contactLastActivity !== 'ANY' || contactDateAdded !== 'ANY' || contactSearchOrigin !== 'ALL' || contactSearchQuery || contactQuickActiveMonth) && (
                          <button onClick={() => { setContactSort('newest'); setContactSearchRole('ALL'); setContactSearchCompany('ALL'); setContactSearchCoType('ALL'); setContactHasNotes('ANY'); setContactLastActivity('ANY'); setContactDateAdded('ANY'); setContactSearchOrigin('ALL'); setContactSearchQuery(''); setContactQuickActiveMonth(false); }} style={{ fontSize: '11px', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>Clear all</button>
                        )}
                      </div>
                      {!isMobile && contactShowMoreFilters && (
                        <div style={{ overflowX: 'auto', paddingBottom: '2px' }}>
                          <div style={{ display: 'flex', gap: '4px', minWidth: 'max-content' }}>
                            <select value={contactSearchCompany} onChange={e => setContactSearchCompany(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactSearchCompany !== 'ALL' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactSearchCompany !== 'ALL' ? '#f0fdf4' : '#fff', color: contactSearchCompany !== 'ALL' ? '#059669' : '#475569' }}>
                              <option value="ALL">Any company</option>
                              {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                            <select value={contactSearchCoType} onChange={e => setContactSearchCoType(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactSearchCoType !== 'ALL' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactSearchCoType !== 'ALL' ? '#f0fdf4' : '#fff', color: contactSearchCoType !== 'ALL' ? '#059669' : '#475569' }}>
                              <option value="ALL">Any co. type</option>
                              <option value="Auction House">Auction House</option>
                              <option value="Estate Agent">Estate Agent</option>
                              <option value="Solicitor">Solicitor</option>
                              <option value="Surveyor">Surveyor</option>
                              <option value="Builder">Builder</option>
                              <option value="Mortgage Broker">Mortgage Broker</option>
                            </select>
                            <select value={contactHasNotes} onChange={e => setContactHasNotes(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactHasNotes !== 'ANY' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactHasNotes !== 'ANY' ? '#f0fdf4' : '#fff', color: contactHasNotes !== 'ANY' ? '#059669' : '#475569' }}>
                              <option value="ANY">Notes: any</option>
                              <option value="yes">Has notes</option>
                              <option value="no">No notes</option>
                            </select>
                            <select value={contactLastActivity} onChange={e => setContactLastActivity(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactLastActivity !== 'ANY' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactLastActivity !== 'ANY' ? '#f0fdf4' : '#fff', color: contactLastActivity !== 'ANY' ? '#059669' : '#475569' }}>
                              <option value="ANY">Activity: any</option>
                              <option value="7d">Last 7 days</option>
                              <option value="30d">Last 30 days</option>
                              <option value="90d">Last 90 days</option>
                              <option value="over90">Over 90 days</option>
                              <option value="never">Never</option>
                            </select>
                            <select value={contactDateAdded} onChange={e => setContactDateAdded(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactDateAdded !== 'ANY' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactDateAdded !== 'ANY' ? '#f0fdf4' : '#fff', color: contactDateAdded !== 'ANY' ? '#059669' : '#475569' }}>
                              <option value="ANY">Added: any</option>
                              <option value="7d">Last 7 days</option>
                              <option value="30d">Last 30 days</option>
                              <option value="90d">Last 90 days</option>
                            </select>
                            <select value={contactSearchOrigin} onChange={e => setContactSearchOrigin(e.target.value)} style={{ padding: '5px 6px', border: '1px solid ' + (contactSearchOrigin !== 'ALL' ? '#059669' : '#e2e8f0'), borderRadius: '6px', fontSize: '11px', backgroundColor: contactSearchOrigin !== 'ALL' ? '#f0fdf4' : '#fff', color: contactSearchOrigin !== 'ALL' ? '#059669' : '#475569' }}>
                              <option value="ALL">Any origin</option>
                              <option value="Direct approach">Direct approach</option>
                              <option value="Referral">Referral</option>
                              <option value="Auction">Auction</option>
                              <option value="LinkedIn">LinkedIn</option>
                              <option value="Recommendation">Recommendation</option>
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px' }}>
                            <button onClick={() => setContactQuickActiveMonth(!contactQuickActiveMonth)} style={{ padding: '3px 8px', border: '1px solid ' + (contactQuickActiveMonth ? '#059669' : '#e2e8f0'), borderRadius: '10px', fontSize: '10px', backgroundColor: contactQuickActiveMonth ? '#f0fdf4' : '#fff', color: contactQuickActiveMonth ? '#059669' : '#64748b', cursor: 'pointer' }}>⚡ Active this month</button>
                          </div>
                        </div>
                      )}
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
                      <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '760px' }}>
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
                                <td style={{ padding: '11px 14px', fontSize: '11px' }}>{(() => { const lastNote = globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === con.id).sort((a, b) => b.date.localeCompare(a.date))[0]?.date || con.lastActivity || ''; const isRecent = lastNote && Math.floor((new Date() - new Date(lastNote)) / 86400000) <= 7; return <span style={{ color: isRecent ? '#059669' : '#94a3b8' }}>{lastNote || '—'}</span>; })()}</td>
                                <td style={{ padding: '11px 14px' }} onClick={e => { e.stopPropagation(); if(window.confirm(`Delete ${con.name}?`)) setContacts(contacts.filter(c => c.id !== con.id)); }}><Trash2 size={13} style={{ color: '#fca5a5', cursor: 'pointer' }} /></td>
                              </tr>
                            );
                          })}
                          {filteredContacts.length === 0 && <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No contacts yet — click + New contact to add one</td></tr>}
                        </tbody>
                      </table>
                      </div>
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
                          {globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === currentViewContact.id).sort((a, b) => b.date.localeCompare(a.date)).map(n => (
                            <div key={n.id} style={{ padding: '8px 10px', backgroundColor: NOTE_TYPE_BG[n.type] || '#f8fafc', border: '1px solid ' + (NOTE_TYPE_COLORS[n.type] ? NOTE_TYPE_COLORS[n.type] + '33' : '#e2e8f0'), borderRadius: '6px', marginBottom: '6px', position: 'relative' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', backgroundColor: NOTE_TYPE_COLORS[n.type] || '#94a3b8', color: '#fff', fontWeight: '600' }}>{n.type}</span>
                                <span style={{ fontSize: '10px', color: '#94a3b8' }}>{n.date} · {n.author}</span>
                              </div>
                              <div style={{ fontSize: '12px', color: NOTE_TYPE_TEXT[n.type] || '#0f172a' }}>{n.text}</div>
                              <button onClick={() => setGlobalNotes(globalNotes.filter(x => x.id !== n.id))} style={{ position: 'absolute', top: '6px', right: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', lineHeight: 1 }}>✕</button>
                            </div>
                          ))}
                          {globalNotes.filter(n => n.targetType === 'Contact' && n.targetId === currentViewContact.id).length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>No notes yet</div>}
                          <form onSubmit={e => handleAddUnifiedNote(e, 'Contact', currentViewContact.id)} style={{ marginTop: '8px' }}>
                            <textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note…" rows={3} style={{ width: '100%', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                              <select value={noteType} onChange={e => setNoteType(e.target.value)} style={{ flex: 1, padding: '6px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', backgroundColor: '#fff' }}>
                                <option value="Call">📞 Call</option>
                                <option value="Meeting">🤝 Meeting</option>
                                <option value="Email">✉️ Email</option>
                                <option value="Review">📋 Review</option>
                                <option value="Task">✅ Task</option>
                                <option value="Flag">🚩 Flag</option>
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
                        <div><label style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '3px' }}>Initial note (optional)</label>
                          <textarea value={newConNote} onChange={e => setNewConNote(e.target.value)} placeholder="How you met, context, first impression…" rows={3} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }} />
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
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '12px' }}>
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
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '230px 1fr', gap: '14px', alignItems: 'start' }}>
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
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px' }}>
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
                                  <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                                  <div style={{ minWidth: '520px' }}>
                                  {/* Table header */}
                                  <div style={{ display: 'grid', gridTemplateColumns: colTemplate, backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                    <div style={{ padding: '10px 14px', fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', alignItems: 'center' }}>Metric</div>
                                    {compareDeals.map((d, i) => (
                                      <div key={i} style={{ padding: '10px 12px', borderLeft: '0.5px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: '#7C3AED', color: '#fff', fontSize: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
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
                                  </div>
                                  </div>
                                  <div style={{ padding: '7px 14px', fontSize: '10px', color: '#94a3b8', borderTop: '0.5px solid #f1f5f9' }}>★ best value for that metric</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {/* Right: selected deal */}
                        {!compareMode && activeDeal && an ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Export + AI actions */}
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              <button onClick={() => exportDealPack(activeDeal)} style={{ padding: '8px 16px', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>📄 Export lender deal pack</button>
                              <button onClick={() => runAiDealReview(activeDeal)} disabled={aiReviewLoadingId === activeDeal.id} style={{ padding: '8px 16px', backgroundColor: aiReviewLoadingId === activeDeal.id ? '#c4b5fd' : '#7C3AED', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '12px', fontWeight: '600', cursor: aiReviewLoadingId === activeDeal.id ? 'wait' : 'pointer' }}>
                                {aiReviewLoadingId === activeDeal.id ? '⏳ Reviewing… (can take a minute)' : an.aiSummary ? '🤖 Re-run AI review' : '🤖 AI deal review'}
                              </button>
                            </div>

                            {/* Verdict */}
                            <div style={{ padding: '12px 16px', borderRadius: '8px', backgroundColor: verdictBg(an.bidStrength), border: `1px solid ${verdictBorder(an.bidStrength)}` }}>
                              <div style={{ fontSize: '13px', fontWeight: '600', color: verdictCol(an.bidStrength), marginBottom: '2px' }}>{an.verdict || (an.bidStrength?.toUpperCase() + ' BID')}</div>
                              <div style={{ fontSize: '11px', color: verdictCol(an.bidStrength), opacity: 0.8 }}>
                                {[an.epcRating && `EPC ${an.epcRating}`, an.floorArea, (an.propertyTypeFromReport || '').split('(')[0].trim(), an.auctionHouseFromReport].filter(Boolean).join(' · ')}
                              </div>
                            </div>

                            {/* AI review */}
                            {an.aiSummary && (() => {
                              const score = an.aiDealScore ?? 0;
                              const scoreCol = score >= 70 ? '#059669' : score >= 45 ? '#d97706' : '#dc2626';
                              const verdictLabel = { strong_buy: 'Strong buy', buy: 'Buy', conditional: 'Conditional', avoid: 'Avoid' }[an.aiVerdict] || an.aiVerdict;
                              return (
                                <div style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '10px', padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    <div style={{ fontSize: '12px', fontWeight: '700', color: '#6d28d9' }}>🤖 AI deal review</div>
                                    <span style={{ fontSize: '11px', padding: '2px 10px', borderRadius: '12px', background: '#fff', border: `1px solid ${scoreCol}`, color: scoreCol, fontWeight: '700' }}>{score}/100 · {verdictLabel}</span>
                                    {an.aiReviewedAt && <span style={{ fontSize: '10px', color: '#a78bfa', marginLeft: 'auto' }}>{new Date(an.aiReviewedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                                  </div>
                                  <div style={{ height: '6px', background: '#ede9fe', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                                    <div style={{ width: `${score}%`, height: '100%', background: scoreCol }}></div>
                                  </div>
                                  <div style={{ fontSize: '12px', color: '#3b0764', lineHeight: 1.6, marginBottom: (an.aiRiskFlags?.length || an.aiStrengths?.length) ? '10px' : 0 }}>{an.aiSummary}</div>
                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                                    {(an.aiRiskFlags || []).length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#991b1b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Risk flags</div>
                                        {an.aiRiskFlags.map((r, i) => <div key={i} style={{ fontSize: '11px', color: '#7f1d1d', padding: '3px 0', display: 'flex', gap: '6px' }}><span>⚠</span><span>{r}</span></div>)}
                                      </div>
                                    )}
                                    {(an.aiStrengths || []).length > 0 && (
                                      <div>
                                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#166534', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Strengths</div>
                                        {an.aiStrengths.map((s, i) => <div key={i} style={{ fontSize: '11px', color: '#14532d', padding: '3px 0', display: 'flex', gap: '6px' }}><span>✓</span><span>{s}</span></div>)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* KPI row */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '8px' }}>
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
                                <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
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
                                              {row.label} {isTarget && <span style={{ fontSize: '10px', color: '#7C3AED', fontWeight: '700' }}>★</span>}
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px' }}>
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
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
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
                const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
                const tomorrowStr = tmrw.toISOString().split('T')[0];

                // Normalize legacy status values
                const normStatus = (t) => {
                  if (!t.status || t.status === 'open') return 'not_started';
                  return t.status;
                };

                // ── Render helpers ──────────────────────────────────────
                const statusPill = (status) => {
                  const s = TASK_STATUS_MAP[status] || TASK_STATUS_MAP['not_started'];
                  return <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: s.bg, color: s.color, fontWeight: '600', whiteSpace: 'nowrap' }}>{s.label}</span>;
                };

                const priorityBadge = (p) => {
                  const map = { High: { bg: '#fee2e2', color: '#991b1b' }, Medium: { bg: '#fef3c7', color: '#92400e' }, Low: { bg: '#f1f5f9', color: '#475569' } };
                  const s = map[p] || map.Medium;
                  return <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', background: s.bg, color: s.color, fontWeight: '600' }}>{p || 'Medium'}</span>;
                };

                const assigneeChip = (name, small) => {
                  if (!name) return null;
                  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                  const isMe = name === user.name;
                  const fs = small ? '10px' : '11px';
                  const sz = small ? 14 : 16;
                  return (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: fs, background: isMe ? '#fef3c7' : '#e1f5ee', color: isMe ? '#92400e' : '#0f6e56', padding: '2px 7px', borderRadius: '10px', fontWeight: '500', whiteSpace: 'nowrap' }}>
                      <span style={{ width: sz, height: sz, borderRadius: '50%', background: isMe ? '#d97706' : '#1d9e75', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: small ? '8px' : '9px', fontWeight: '700', flexShrink: 0 }}>{initials}</span>
                      {name}
                    </span>
                  );
                };

                const dueDateDisplay = (t, ns) => {
                  if (!t.dueDate) return <span style={{ color: '#94a3b8' }}>—</span>;
                  if (ns === 'done') return <span style={{ color: '#94a3b8', textDecoration: 'line-through', fontSize: '11px' }}>{t.dueDate}</span>;
                  if (t.dueDate < todayStr) return <span style={{ color: '#dc2626', fontWeight: '600', fontSize: '11px' }}>{t.dueDate} ⚠</span>;
                  if (t.dueDate === todayStr) return <span style={{ color: '#d97706', fontWeight: '600', fontSize: '11px' }}>Today</span>;
                  if (t.dueDate === tomorrowStr) return <span style={{ color: '#d97706', fontSize: '11px' }}>Tomorrow</span>;
                  return <span style={{ color: '#475569', fontSize: '11px' }}>{t.dueDate}</span>;
                };

                // ── State helpers ───────────────────────────────────────
                const updateTask = (id, changes) => {
                  const logEntry = { id: Date.now() + Math.random(), type: 'updated', detail: Object.keys(changes).filter(k => !['activityLog', 'updatedAt'].includes(k)).join(', ') + ' updated', user: user.name || 'You', at: new Date().toISOString() };
                  setTasks(prev => prev.map(t => t.id === id ? { ...t, ...changes, activityLog: [...(t.activityLog || []), logEntry], updatedAt: new Date().toISOString() } : t));
                };

                const toggleTaskDone = (task) => {
                  const ns = normStatus(task);
                  const nowDone = ns !== 'done';
                  const changes = { status: nowDone ? 'done' : 'not_started', completedAt: nowDone ? new Date().toISOString() : null, completedBy: nowDone ? (user.name || 'You') : '' };
                  updateTask(task.id, changes);
                  if (nowDone && task.linkedType === 'Property' && task.linkedId) {
                    const linked = properties.find(p => p.id === task.linkedId);
                    if (linked) {
                      const updated = withActivity(linked, 'note', `Task completed: ${task.title}`);
                      setProperties(prev => prev.map(p => p.id === linked.id ? updated : p));
                      if (currentViewProperty?.id === linked.id) setCurrentViewProperty(updated);
                    }
                  }
                };

                const addTaskComment = (taskId, body) => {
                  if (!body.trim()) return;
                  const comment = { id: Date.now(), author: user.name || 'You', body: body.trim(), createdAt: new Date().toISOString(), edited: false };
                  setTasks(prev => prev.map(t => t.id === taskId ? { ...t, comments: [...(t.comments || []), comment], activityLog: [...(t.activityLog || []), { id: Date.now() + Math.random(), type: 'comment_added', detail: 'Comment added', user: user.name || 'You', at: new Date().toISOString() }] } : t));
                  setDrawerNewComment('');
                };

                const addTaskSubtask = (taskId, title) => {
                  if (!title.trim()) return;
                  setTasks(prev => prev.map(t => t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now(), title: title.trim(), done: false, assignee: '', dueDate: '', createdAt: new Date().toISOString() }] } : t));
                  setDrawerNewSubtask('');
                };

                const toggleSubtask = (taskId, subtaskId) => {
                  setTasks(prev => prev.map(t => {
                    if (t.id !== taskId) return t;
                    const updated = (t.subtasks || []).map(s => s.id === subtaskId ? { ...s, done: !s.done } : s);
                    const allDone = updated.length > 0 && updated.every(s => s.done);
                    return { ...t, subtasks: updated, ...(allDone && normStatus(t) !== 'done' ? { status: 'done', completedAt: new Date().toISOString(), completedBy: user.name || 'You' } : {}) };
                  }));
                };

                const handleAddTask = (e) => {
                  e.preventDefault();
                  if (!newTaskTitle.trim()) return;
                  const lo = newTaskLinkedType === 'Property' ? properties : newTaskLinkedType === 'Company' ? companies : newTaskLinkedType === 'Contact' ? contacts : [];
                  const linkedName = lo.find(x => x.id === parseInt(newTaskLinkedId))?.address || lo.find(x => x.id === parseInt(newTaskLinkedId))?.name || '';
                  setTasks(prev => [...prev, {
                    id: Date.now(), title: newTaskTitle, dueDate: newTaskDue, priority: newTaskPriority,
                    status: newTaskStatus || 'not_started', linkedType: newTaskLinkedType,
                    linkedId: newTaskLinkedId ? parseInt(newTaskLinkedId) : null, linkedName,
                    notes: newTaskNotes, assignee: newTaskAssignee || user.name || 'Ashley',
                    createdDate: todayStr, createdBy: user.name || 'Ashley',
                    waitingOn: newTaskWaitingOn, subtasks: [], comments: [], reminders: [],
                    activityLog: [{ id: Date.now(), type: 'created', detail: 'Task created', user: user.name || 'You', at: new Date().toISOString() }],
                  }]);
                  setNewTaskTitle(''); setNewTaskDue(''); setNewTaskPriority('Medium'); setNewTaskStatus('not_started');
                  setNewTaskLinkedType(''); setNewTaskLinkedId(''); setNewTaskNotes(''); setNewTaskWaitingOn('');
                };

                const applyTemplate = () => {
                  const allTpls = [...DEFAULT_TASK_TEMPLATES, ...taskTemplates];
                  const tpl = allTpls.find(t => t.id === taskApplyTemplateSel);
                  if (!tpl || !taskApplyPropId) return;
                  const prop = properties.find(p => p.id === parseInt(taskApplyPropId));
                  const baseDate = taskApplyDate ? new Date(taskApplyDate) : new Date();
                  const newTasks = tpl.items.map(item => {
                    const due = new Date(baseDate);
                    due.setDate(due.getDate() + (item.dayOffset || 0));
                    return {
                      id: Date.now() + Math.random(), title: item.title,
                      dueDate: due.toISOString().split('T')[0], priority: item.priority || 'Medium',
                      status: 'not_started', linkedType: 'Property',
                      linkedId: parseInt(taskApplyPropId), linkedName: prop?.dealName || prop?.address?.split(',')[0] || '',
                      notes: '', assignee: user.name || 'Ashley', createdDate: todayStr,
                      createdBy: user.name || 'Ashley', waitingOn: item.waitingOn || '',
                      templateId: tpl.id, subtasks: [], comments: [], reminders: [],
                      activityLog: [{ id: Date.now(), type: 'created', detail: `Created from template: ${tpl.name}`, user: user.name || 'You', at: new Date().toISOString() }],
                    };
                  });
                  setTasks(prev => [...prev, ...newTasks]);
                  setShowTaskApplyModal(false); setTaskApplyTemplateSel(''); setTaskApplyPropId(''); setTaskApplyDate('');
                };

                // ── Filtering ───────────────────────────────────────────
                const assigneeOptions = crmUsers.length > 0 ? crmUsers.map(u => u.name).filter(Boolean) : [user.name || 'Ashley'];
                const allTasksNorm = tasks.map(t => ({ ...t, _ns: normStatus(t) }));

                let subFiltered = allTasksNorm;
                if (taskSubFilter === 'today') subFiltered = allTasksNorm.filter(t => t.dueDate === todayStr && t._ns !== 'done');
                else if (taskSubFilter === 'mine') subFiltered = allTasksNorm.filter(t => (t.assignee === user.name || !t.assignee) && t._ns !== 'done');
                else if (taskSubFilter === 'waiting') subFiltered = allTasksNorm.filter(t => t._ns === 'waiting');

                let filtered = subFiltered;
                if (taskSidebarStatus === 'active') filtered = filtered.filter(t => t._ns !== 'done');
                else if (taskSidebarStatus !== 'all') filtered = filtered.filter(t => t._ns === taskSidebarStatus);
                if (taskSidebarPriority !== 'all') filtered = filtered.filter(t => t.priority === taskSidebarPriority);
                if (taskSidebarAssignee !== 'all') filtered = filtered.filter(t => t.assignee === taskSidebarAssignee);
                if (taskSidebarProperty !== 'all') filtered = filtered.filter(t => String(t.linkedId) === taskSidebarProperty);

                const sortedTasks = [...filtered].sort((a, b) => {
                  const aDone = a._ns === 'done', bDone = b._ns === 'done';
                  if (aDone !== bDone) return aDone ? 1 : -1;
                  const aOver = a.dueDate && a.dueDate < todayStr && !aDone;
                  const bOver = b.dueDate && b.dueDate < todayStr && !bDone;
                  if (aOver !== bOver) return aOver ? -1 : 1;
                  if (!a.dueDate && !b.dueDate) return 0;
                  if (!a.dueDate) return 1;
                  if (!b.dueDate) return -1;
                  return a.dueDate < b.dueDate ? -1 : 1;
                });

                // KPI
                const overdueCount = allTasksNorm.filter(t => t.dueDate && t.dueDate < todayStr && t._ns !== 'done').length;
                const todayCount = allTasksNorm.filter(t => t.dueDate === todayStr && t._ns !== 'done').length;
                const waitingCount = allTasksNorm.filter(t => t._ns === 'waiting').length;
                const doneCount = allTasksNorm.filter(t => t._ns === 'done').length;

                const addLinkedOptions = newTaskLinkedType === 'Property' ? properties : newTaskLinkedType === 'Company' ? companies : newTaskLinkedType === 'Contact' ? contacts : [];
                const allTplList = [...DEFAULT_TASK_TEMPLATES, ...taskTemplates];

                const sidebarBtn = (active, onClick, children) => (
                  <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '5px 7px', border: 'none', borderRadius: '6px', background: active ? '#fef3c7' : 'none', color: active ? '#92400e' : '#475569', fontSize: '12px', cursor: 'pointer', textAlign: 'left', fontWeight: active ? '600' : '400' }}>
                    {children}
                  </button>
                );

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* KPI strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: '10px', marginBottom: '14px' }}>
                      {[['Overdue', overdueCount, '#dc2626'], ['Due today', todayCount, '#d97706'], ['Waiting on', waitingCount, '#185fa5'], ['Completed', doneCount, '#166534']].map(([label, val, color]) => (
                        <div key={label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px' }}>
                          <div style={{ fontSize: '10px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '3px' }}>{label}</div>
                          <div style={{ fontSize: '22px', fontWeight: '700', color }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sub-tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fff', marginBottom: 0, overflowX: 'auto' }}>
                      {[['all', 'All tasks'], ['today', 'Today'], ['mine', 'My tasks'], ['waiting', 'Waiting on'], ['templates', 'Templates']].map(([k, l]) => (
                        <button key={k} onClick={() => setTaskSubFilter(k)} style={{ padding: '9px 14px', border: 'none', background: 'none', borderBottom: `2px solid ${taskSubFilter === k ? '#d97706' : 'transparent'}`, color: taskSubFilter === k ? '#d97706' : '#475569', fontSize: '13px', fontWeight: taskSubFilter === k ? '600' : '400', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{l}</button>
                      ))}
                    </div>

                    {/* ── TEMPLATES VIEW ── */}
                    {taskSubFilter === 'templates' && (
                      <div style={{ padding: '16px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                          <div style={{ fontSize: '13px', color: '#475569' }}>{allTplList.length} templates available</div>
                          <button onClick={() => setShowTaskApplyModal(true)} style={{ padding: '7px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>Apply template to property</button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: '12px' }}>
                          {allTplList.map(tpl => (
                            <div key={tpl.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>{tpl.name}</div>
                                <span style={{ fontSize: '10px', background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '10px', fontWeight: '600', flexShrink: 0, marginLeft: '6px' }}>{tpl.items.length} tasks</span>
                              </div>
                              {tpl.description && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '10px' }}>{tpl.description}</div>}
                              <div style={{ fontSize: '11px', color: '#64748b' }}>
                                {tpl.items.slice(0, 5).map((item, i) => (
                                  <div key={i} style={{ padding: '3px 0', borderBottom: '1px solid #f8fafc', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                    <span style={{ width: '12px', height: '12px', border: '1.5px solid #cbd5e1', borderRadius: '3px', display: 'inline-block', flexShrink: 0 }}></span>
                                    {item.title}
                                  </div>
                                ))}
                                {tpl.items.length > 5 && <div style={{ paddingTop: '4px', color: '#94a3b8' }}>+ {tpl.items.length - 5} more tasks</div>}
                              </div>
                              <button onClick={() => { setTaskApplyTemplateSel(tpl.id); setShowTaskApplyModal(true); }} style={{ marginTop: '12px', padding: '6px 12px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '600', width: '100%' }}>Apply to property</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ── MAIN TASK VIEW ── */}
                    {taskSubFilter !== 'templates' && (
                      <div style={{ display: 'flex', gap: 0, marginTop: '12px' }}>
                        {/* Filter sidebar — desktop only */}
                        {!isMobile && (
                          <div style={{ width: '184px', flexShrink: 0, borderRight: '1px solid #e2e8f0', paddingRight: '12px', marginRight: '14px' }}>
                            <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px', marginTop: '4px' }}>Smart views</div>
                            {sidebarBtn(taskSidebarStatus === 'active', () => setTaskSidebarStatus('active'), <><AlertTriangle size={12} />Active tasks<span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>{allTasksNorm.filter(t => t._ns !== 'done').length}</span></>)}
                            {sidebarBtn(taskSidebarAssignee === (user.name || 'Ashley') && taskSidebarStatus === 'active', () => { setTaskSidebarAssignee(user.name || 'Ashley'); setTaskSidebarStatus('active'); }, <><User size={12} />My tasks</>)}
                            {sidebarBtn(false, () => { setTaskSidebarStatus('all'); setTaskSidebarAssignee('all'); setTaskSidebarPriority('all'); setTaskSidebarProperty('all'); }, <><ListChecks size={12} />All tasks<span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>{tasks.length}</span></>)}

                            <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px', marginTop: '12px' }}>Status</div>
                            {sidebarBtn(taskSidebarStatus === 'all' && taskSidebarPriority === 'all' && taskSidebarAssignee === 'all', () => setTaskSidebarStatus('all'), <>All statuses</>)}
                            {TASK_STATUSES.map(s => (
                              sidebarBtn(taskSidebarStatus === s.value, () => setTaskSidebarStatus(s.value),
                                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: s.color, flexShrink: 0 }}></span>{s.label}<span style={{ marginLeft: 'auto', fontSize: '10px', color: '#94a3b8' }}>{allTasksNorm.filter(t => t._ns === s.value).length}</span></>
                              )
                            ))}

                            <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px', marginTop: '12px' }}>Priority</div>
                            {[['all', 'All'], ['High', 'High'], ['Medium', 'Medium'], ['Low', 'Low']].map(([k, l]) => (
                              sidebarBtn(taskSidebarPriority === k, () => setTaskSidebarPriority(k), <>{l}</>)
                            ))}

                            {assigneeOptions.length > 1 && <>
                              <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px', marginTop: '12px' }}>Assignee</div>
                              {sidebarBtn(taskSidebarAssignee === 'all', () => setTaskSidebarAssignee('all'), <>All</>)}
                              {assigneeOptions.map(name => sidebarBtn(taskSidebarAssignee === name, () => setTaskSidebarAssignee(name), <>{assigneeChip(name, true)}</>))}
                            </>}

                            {properties.length > 0 && <>
                              <div style={{ fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '6px', marginTop: '12px' }}>Property</div>
                              {sidebarBtn(taskSidebarProperty === 'all', () => setTaskSidebarProperty('all'), <>Any property</>)}
                              {properties.filter(p => allTasksNorm.some(t => t.linkedId === p.id)).map(p => (
                                sidebarBtn(taskSidebarProperty === String(p.id), () => setTaskSidebarProperty(String(p.id)), <span style={{ fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.dealName || p.address?.split(',')[0]}</span>)
                              ))}
                            </>}
                          </div>
                        )}

                        {/* Task list */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Add task form */}
                          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>Add task</div>
                            <form onSubmit={handleAddTask} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr', gap: '8px' }}>
                                <input required placeholder="Task title (required)" value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px' }} />
                                <input type="date" value={newTaskDue} onChange={e => setNewTaskDue(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px' }} />
                                <select value={newTaskPriority} onChange={e => setNewTaskPriority(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                  <option value="High">High priority</option>
                                  <option value="Medium">Medium priority</option>
                                  <option value="Low">Low priority</option>
                                </select>
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'end' }}>
                                <select value={newTaskStatus} onChange={e => setNewTaskStatus(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                  {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                </select>
                                <select value={newTaskLinkedType} onChange={e => { setNewTaskLinkedType(e.target.value); setNewTaskLinkedId(''); }} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                  <option value="">No link</option>
                                  <option value="Property">Property</option>
                                  <option value="Company">Company</option>
                                  <option value="Contact">Contact</option>
                                </select>
                                {newTaskLinkedType ? (
                                  <select value={newTaskLinkedId} onChange={e => setNewTaskLinkedId(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                    <option value="">Select…</option>
                                    {addLinkedOptions.map(x => <option key={x.id} value={x.id}>{x.address || x.name}</option>)}
                                  </select>
                                ) : (
                                  <select value={newTaskAssignee || user.name || ''} onChange={e => setNewTaskAssignee(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                    {assigneeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                                  </select>
                                )}
                                {newTaskStatus === 'waiting' ? (
                                  <select value={newTaskWaitingOn} onChange={e => setNewTaskWaitingOn(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', background: '#fff' }}>
                                    <option value="">Waiting on…</option>
                                    {WAITING_ON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                ) : <div />}
                                <button type="submit" style={{ padding: '8px 16px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add task</button>
                              </div>
                            </form>
                          </div>

                          {/* Mobile filter chips */}
                          {isMobile && (
                            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginBottom: '10px', paddingBottom: '2px' }}>
                              {[['active', 'Active'], ['not_started', 'Not started'], ['in_progress', 'In progress'], ['waiting', 'Waiting'], ['done', 'Done']].map(([k, l]) => (
                                <button key={k} onClick={() => setTaskSidebarStatus(k)} style={{ padding: '5px 11px', borderRadius: '20px', border: '1px solid #e2e8f0', background: taskSidebarStatus === k ? '#fef3c7' : '#fff', color: taskSidebarStatus === k ? '#92400e' : '#475569', fontSize: '11px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>{l}</button>
                              ))}
                            </div>
                          )}

                          {/* Task rows */}
                          {sortedTasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px', background: '#fff' }}>
                              <ClipboardList size={24} style={{ marginBottom: '8px', opacity: 0.3 }} />
                              <div style={{ fontSize: '13px', fontWeight: '600' }}>No tasks found</div>
                              <div style={{ fontSize: '11px', marginTop: '3px' }}>Use the form above to add your first task</div>
                            </div>
                          ) : sortedTasks.map(task => {
                            const ns = task._ns;
                            const isDone = ns === 'done';
                            const isOverdue = task.dueDate && task.dueDate < todayStr && !isDone;
                            const isExpanded = expandedTaskId === task.id;
                            const subtasks = task.subtasks || [];
                            const comments = task.comments || [];
                            const doneSubtasks = subtasks.filter(s => s.done).length;
                            const borderColor = isExpanded ? '#d97706' : isOverdue ? '#fca5a5' : '#e2e8f0';

                            return (
                              <div key={task.id} style={{ border: `1px solid ${borderColor}`, borderRadius: '8px', marginBottom: '6px', background: '#fff', overflow: 'hidden', opacity: isDone ? 0.65 : 1 }}>
                                {/* Task row */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 10px' }}>
                                  <input type="checkbox" checked={isDone} onChange={() => toggleTaskDone(task)} style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0, accentColor: '#d97706' }} />
                                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setDrawerTaskId(task.id); setShowTaskDrawer(true); }}>
                                    <div style={{ fontWeight: isDone ? '400' : '600', color: isDone ? '#94a3b8' : '#0f172a', textDecoration: isDone ? 'line-through' : 'none', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</div>
                                    {(task.linkedType && task.linkedName) && <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>{task.linkedType}: {task.linkedName}</div>}
                                    {task.waitingOn && <div style={{ fontSize: '10px', color: '#92400e', marginTop: '1px' }}>Waiting on: {task.waitingOn}</div>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                                    {statusPill(ns)}
                                    {!isMobile && priorityBadge(task.priority)}
                                    {!isMobile && task.assignee && assigneeChip(task.assignee, true)}
                                    {dueDateDisplay(task, ns)}
                                    {subtasks.length > 0 && <span style={{ fontSize: '10px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '10px', whiteSpace: 'nowrap' }}>{doneSubtasks}/{subtasks.length}</span>}
                                    {comments.length > 0 && <span style={{ fontSize: '10px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '2px' }}><MessageSquare size={11} />{comments.length}</span>}
                                    <button onClick={() => { setExpandedTaskId(isExpanded ? null : task.id); if (!isExpanded) setExpandedTaskSubTab('subtasks'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', display: 'flex' }} title="Expand">
                                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    <button onClick={() => { setDrawerTaskId(task.id); setShowTaskDrawer(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '2px', display: 'flex' }} title="Open full details">
                                      <Pencil size={13} />
                                    </button>
                                    <button onClick={() => { if (!window.confirm('Delete this task?')) return; setTasks(prev => prev.filter(t => t.id !== task.id)); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', padding: '2px', display: 'flex' }} title="Delete">
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {/* Expanded in-place section */}
                                {isExpanded && (
                                  <div style={{ borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
                                    <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 12px' }}>
                                      {[['subtasks', `Subtasks${subtasks.length > 0 ? ` ${doneSubtasks}/${subtasks.length}` : ''}`], ['comments', `Comments${comments.length > 0 ? ` (${comments.length})` : ''}`], ['activity', 'Activity']].map(([k, l]) => (
                                        <button key={k} onClick={() => setExpandedTaskSubTab(k)} style={{ padding: '6px 10px', border: 'none', background: 'none', borderBottom: `2px solid ${expandedTaskSubTab === k ? '#d97706' : 'transparent'}`, color: expandedTaskSubTab === k ? '#d97706' : '#94a3b8', fontSize: '12px', cursor: 'pointer', fontWeight: expandedTaskSubTab === k ? '600' : '400' }}>{l}</button>
                                      ))}
                                    </div>

                                    {expandedTaskSubTab === 'subtasks' && (
                                      <div style={{ padding: '8px 12px' }}>
                                        {subtasks.length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 0 6px' }}>No subtasks yet</div>}
                                        {subtasks.map(st => (
                                          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid #f8fafc' }}>
                                            <input type="checkbox" checked={st.done} onChange={() => toggleSubtask(task.id, st.id)} style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#d97706' }} />
                                            <span style={{ flex: 1, color: st.done ? '#94a3b8' : '#0f172a', textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</span>
                                          </div>
                                        ))}
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                                          <input placeholder="Add subtask…" value={expandedTaskId === task.id ? drawerNewSubtask : ''} onChange={e => setDrawerNewSubtask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addTaskSubtask(task.id, drawerNewSubtask); } }} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 8px', fontSize: '12px' }} />
                                          <button onClick={() => addTaskSubtask(task.id, drawerNewSubtask)} style={{ padding: '5px 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Add</button>
                                        </div>
                                      </div>
                                    )}

                                    {expandedTaskSubTab === 'comments' && (
                                      <div style={{ padding: '8px 12px' }}>
                                        {comments.length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 0 6px' }}>No comments yet</div>}
                                        {comments.map(cm => (
                                          <div key={cm.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                            <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: cm.author === user.name ? '#fef3c7' : '#e1f5ee', color: cm.author === user.name ? '#92400e' : '#0f6e56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{(cm.author || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                                            <div style={{ flex: 1 }}>
                                              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}><strong>{cm.author}</strong> · {cm.createdAt ? new Date(cm.createdAt).toLocaleDateString('en-GB') : ''}{cm.edited ? ' (edited)' : ''}</div>
                                              <div style={{ fontSize: '12px', color: '#0f172a', lineHeight: '1.4' }}>{cm.body}</div>
                                            </div>
                                          </div>
                                        ))}
                                        <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                                          <input placeholder={`${user.name || 'You'}: add a comment…`} value={expandedTaskId === task.id ? drawerNewComment : ''} onChange={e => setDrawerNewComment(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { addTaskComment(task.id, drawerNewComment); } }} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '5px', padding: '5px 8px', fontSize: '12px' }} />
                                          <button onClick={() => addTaskComment(task.id, drawerNewComment)} style={{ padding: '5px 10px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>Post</button>
                                        </div>
                                      </div>
                                    )}

                                    {expandedTaskSubTab === 'activity' && (
                                      <div style={{ padding: '8px 12px', maxHeight: '160px', overflowY: 'auto' }}>
                                        {(task.activityLog || []).length === 0 && <div style={{ fontSize: '11px', color: '#94a3b8' }}>No activity yet</div>}
                                        {[...(task.activityLog || [])].reverse().map((entry, i) => (
                                          <div key={i} style={{ fontSize: '11px', color: '#64748b', padding: '3px 0', borderBottom: '1px solid #f8fafc' }}>
                                            <strong>{entry.user}</strong> · {entry.detail} · {entry.at ? new Date(entry.at).toLocaleDateString('en-GB') : ''}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ==================== TAB: REFURB COST & TRADE QUOTE BUILDER ==================== */}
              {activeTab === 'refurb' && (() => {
                // ── helpers ──────────────────────────────────────────────────
                const fmt = (n) => n ? `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : '—';
                const pmLabel = (k) => PRICING_METHODS.find(m => m.key === k)?.label || k || '—';
                const statusBadge = (s) => {
                  const c = QUOTE_STATUS_COLORS[s] || { bg:'#f1f5f9', color:'#475569' };
                  return <span style={{ fontSize:'10px', padding:'2px 8px', borderRadius:'10px', backgroundColor:c.bg, color:c.color, fontWeight:'700', textTransform:'capitalize', whiteSpace:'nowrap' }}>{(s||'').replace('_',' ')}</span>;
                };
                const starRating = (val, max=5) => {
                  return <span style={{ color:'#eab308', fontSize:'12px' }}>{'★'.repeat(Math.round(val||0))}{'☆'.repeat(max - Math.round(val||0))}</span>;
                };
                const getQuoteNet = (q) => parseFloat(q.totalAmount)||0;
                const getQuoteVAT = (q) => parseFloat(q.vatAmount)||(getQuoteNet(q)*(parseFloat(q.vatRate||0)/100));
                const getQuoteTotal = (q) => getQuoteNet(q) + getQuoteVAT(q);
                const getPropName = (id) => {
                  const p = properties.find(x => x.id === parseInt(id));
                  return p ? (p.dealName || p.address?.split(',')[0] || '—') : '—';
                };
                const getCompanyName = (id) => companies.find(c => c.id === parseInt(id))?.name || '—';
                const getContactName = (id) => contacts.find(c => c.id === parseInt(id))?.name || '—';

                // ── quote CRUD ────────────────────────────────────────────────
                const openAddQuote = (preset = {}) => {
                  setEditingQuoteId(null);
                  setQuoteForm({ ...EMPTY_QUOTE_FORM, ...preset, quoteDate: new Date().toISOString().split('T')[0] });
                  setQuoteModalTab('details');
                  setShowQuoteModal(true);
                };
                const openEditQuote = (q) => {
                  setEditingQuoteId(q.id);
                  setQuoteForm({ ...EMPTY_QUOTE_FORM, ...q, propertyId: String(q.propertyId||''), companyId: String(q.companyId||''), contactId: String(q.contactId||'') });
                  setQuoteModalTab('details');
                  setShowQuoteModal(true);
                };
                const deleteQuote = (id) => {
                  if (!window.confirm('Delete this quote? This cannot be undone.')) return;
                  setRefurbQuotes(prev => prev.filter(q => q.id !== id));
                };

                // ── filtered quotes ───────────────────────────────────────────
                const filteredQuotes = refurbQuotes.filter(q => {
                  if (rfTradeFilter !== 'ALL' && q.tradeCategory !== rfTradeFilter) return false;
                  if (rfStatusFilter !== 'ALL' && q.status !== rfStatusFilter) return false;
                  if (rfPropertyFilter !== 'ALL' && String(q.propertyId||'') !== rfPropertyFilter) return false;
                  if (rfCompanyFilter !== 'ALL' && String(q.companyId||'') !== rfCompanyFilter) return false;
                  if (rfPricingFilter !== 'ALL' && q.pricingMethod !== rfPricingFilter) return false;
                  if (rfSearch.trim()) {
                    const hay = [q.tradeCategory, q.scopeOfWorks, q.notes, q.quoteRef,
                      getCompanyName(q.companyId), getContactName(q.contactId), getPropName(q.propertyId)
                    ].join(' ').toLowerCase();
                    if (!hay.includes(rfSearch.toLowerCase())) return false;
                  }
                  return true;
                });

                // ── dashboard KPIs ────────────────────────────────────────────
                const totalQ = refurbQuotes.length;
                const neededQ = refurbQuotes.filter(q=>q.status==='needed').length;
                const receivedQ = refurbQuotes.filter(q=>['received','reviewing'].includes(q.status)).length;
                const acceptedQ = refurbQuotes.filter(q=>q.status==='accepted').length;
                const acceptedValue = refurbQuotes.filter(q=>q.status==='accepted').reduce((s,q)=>s+getQuoteNet(q),0);
                const today = new Date().toISOString().split('T')[0];
                const expiringQ = refurbQuotes.filter(q=>{
                  if(!q.expiryDate||q.status==='accepted'||q.status==='rejected') return false;
                  const days = Math.ceil((new Date(q.expiryDate)-new Date())/86400000);
                  return days>=0 && days<=7;
                }).length;
                const bookedQ = refurbQuotes.filter(q=>['booked','in_progress'].includes(q.status)).length;

                // ── mixer calculations ────────────────────────────────────────
                const mixerProperty = properties.find(p=>p.id===parseInt(mixerPropId));
                const mixerPropQuotes = mixerProperty
                  ? refurbQuotes.filter(q=>q.propertyId===mixerProperty.id && q.status!=='rejected')
                  : [];
                const mixerTrades = [...new Set(mixerPropQuotes.map(q=>q.tradeCategory))].sort((a,b)=>TRADE_SEQUENCE.indexOf(a)-TRADE_SEQUENCE.indexOf(b));
                const selectedQuotes = Object.entries(mixerSel).map(([,qid])=>refurbQuotes.find(q=>q.id===parseInt(qid))).filter(Boolean);
                const mLabour = selectedQuotes.reduce((s,q)=>s+(parseFloat(q.labourAmount)||0),0);
                const mMats = selectedQuotes.reduce((s,q)=>s+(parseFloat(q.materialsAmount)||0),0);
                const mSubtotal = selectedQuotes.reduce((s,q)=>s+getQuoteNet(q),0);
                const mVAT = selectedQuotes.reduce((s,q)=>s+getQuoteVAT(q),0);
                const mContingencyAmt = mSubtotal * (mixerContingency/100);
                const mGrand = mSubtotal + mVAT + mContingencyAmt;
                const mDurationWks = selectedQuotes.reduce((s,q)=>s+(parseFloat(q.estimatedDurationWeeks)||0),0);

                // ── sample data loader ────────────────────────────────────────
                const loadSampleData = () => {
                  if (!window.confirm('Load sample trade quotes? This will add test data to your Refurb Quotes module.')) return;
                  const propId = properties[0]?.id || null;
                  const now = new Date().toISOString().split('T')[0];
                  const samples = [
                    { id:Date.now()+1, propertyId:propId, tradeCategory:'Electrician', companyId:null, contactId:null, quoteRef:'SPARK-001', quoteDate:now, expiryDate:'2026-08-31', status:'received', pricingMethod:'fixed', totalAmount:'4800', labourAmount:'3200', materialsAmount:'1600', vatRate:'20', vatAmount:'960', scopeOfWorks:'Full rewire — consumer unit upgrade, 36 sockets, 18 lighting circuits, EICR certificate', included:'All materials, consumer unit, sockets, plates, certification', excluded:'Decoration after installation', startAvailability:'2026-07-14', leadTimeWeeks:'2', noticeDays:'7', estimatedDurationWeeks:'1.5', dependencies:['Builder/Groundworks','Damp Specialist'], paymentTerms:'50% deposit, balance on completion', warranty:'6-year workmanship guarantee', insuranceChecked:true, certifications:['NICEIC'], notes:'Spark Electric Ltd — good reputation in Sheffield', rating:{ priceLevel:4, reliability:5, quality:5, quoteSpeed:4, communication:5, availability:3, flipExperience:4, wouldUseAgain:true, overallRating:5 }, createdAt:now },
                    { id:Date.now()+2, propertyId:propId, tradeCategory:'Plumber/Heating', companyId:null, contactId:null, quoteRef:'SPC-2026-14', quoteDate:now, expiryDate:'2026-09-15', status:'received', pricingMethod:'fixed', totalAmount:'6200', labourAmount:'3800', materialsAmount:'2400', vatRate:'20', vatAmount:'1240', scopeOfWorks:'New combi boiler (Worcester 30i), 8 radiators + TRVs, full heating controls, Landlord Gas Safety Cert', included:'Boiler, radiators, pipework, controls, gas safety cert', excluded:'Drywall/plaster making good', startAvailability:'2026-07-21', leadTimeWeeks:'3', noticeDays:'5', estimatedDurationWeeks:'1', dependencies:['Builder/Groundworks'], paymentTerms:'30% on order, 70% on completion', warranty:'5-year boiler warranty, 1-year labour', insuranceChecked:true, certifications:['Gas Safe'], notes:'Sheffield Plumbing Co — very competitive on boiler installs', rating:{ priceLevel:3, reliability:4, quality:4, quoteSpeed:5, communication:4, availability:4, flipExperience:3, wouldUseAgain:true, overallRating:4 }, createdAt:now },
                    { id:Date.now()+3, propertyId:propId, tradeCategory:'Plasterer', companyId:null, contactId:null, quoteRef:'DP-Q-2026', quoteDate:now, expiryDate:'2026-09-30', status:'reviewing', pricingMethod:'per_room', totalAmount:'3400', labourAmount:'3200', materialsAmount:'200', vatRate:'0', vatAmount:'0', scopeOfWorks:'Full skim plaster — 5 rooms, 2 landings, hallway. Replace blown areas, ceiling repairs in kitchen.', included:'All plastering, making good, kitchen ceiling repair', excluded:'Bonding coats where boarding needed', startAvailability:'2026-08-04', leadTimeWeeks:'4', noticeDays:'3', estimatedDurationWeeks:'1.5', dependencies:['Electrician','Plumber/Heating','Damp Specialist'], paymentTerms:'Cash on completion per stage', warranty:'Responsible for any cracking within 12 months', insuranceChecked:false, certifications:[], notes:'Sole trader — not VAT registered. Very tidy worker, used before.', rating:{ priceLevel:5, reliability:4, quality:4, quoteSpeed:3, communication:3, availability:4, flipExperience:4, wouldUseAgain:true, overallRating:4 }, createdAt:now },
                    { id:Date.now()+4, propertyId:propId, tradeCategory:'Damp Specialist', companyId:null, contactId:null, quoteRef:'DSY-0062', quoteDate:now, expiryDate:'2026-08-15', status:'accepted', pricingMethod:'per_linear_m', totalAmount:'2100', labourAmount:'1400', materialsAmount:'700', vatRate:'20', vatAmount:'420', scopeOfWorks:'Rising damp treatment — chemical DPC to rear wall (12 linear metres), re-plaster damp area, tanking to cellar steps', included:'Chemical injection, re-plaster, tanking treatment, 30-year guarantee cert', excluded:'Redecoration', startAvailability:'2026-07-07', leadTimeWeeks:'1', noticeDays:'2', estimatedDurationWeeks:'0.5', dependencies:[], paymentTerms:'100% upfront (standard for damp work)', warranty:'30-year transferable guarantee', insuranceChecked:true, certifications:['PCA Member'], notes:'Damp Solutions Yorkshire — professional survey done. Rising damp confirmed.', rating:{ priceLevel:3, reliability:5, quality:5, quoteSpeed:5, communication:5, availability:5, flipExperience:5, wouldUseAgain:true, overallRating:5 }, createdAt:now },
                    { id:Date.now()+5, propertyId:propId, tradeCategory:'Painter/Decorator', companyId:null, contactId:null, quoteRef:'PD-SY-88', quoteDate:now, expiryDate:'2026-10-31', status:'received', pricingMethod:'per_room', totalAmount:'2800', labourAmount:'2600', materialsAmount:'200', vatRate:'0', vatAmount:'0', scopeOfWorks:'Full internal decoration — 5 beds, 2 bath, kitchen, lounge, halls/stairs. 2 coats emulsion walls, 1 coat ceilings, gloss woodwork.', included:'Labour, standard emulsion. Client to supply paint colours.', excluded:'External painting, specialist finishes, feature walls', startAvailability:'2026-09-01', leadTimeWeeks:'6', noticeDays:'7', estimatedDurationWeeks:'2', dependencies:['Plasterer','Carpenter/Joiner'], paymentTerms:'Thirds — start, mid, end', warranty:'12-month touch-up guarantee', insuranceChecked:false, certifications:[], notes:'Sole trader — used on 3 previous flips. Reliable, clean, fast.', rating:{ priceLevel:5, reliability:5, quality:4, quoteSpeed:4, communication:4, availability:3, flipExperience:5, wouldUseAgain:true, overallRating:5 }, createdAt:now },
                    { id:Date.now()+6, propertyId:propId, tradeCategory:'Flooring', companyId:null, contactId:null, quoteRef:'SFI-2026-Q', quoteDate:now, expiryDate:'2026-10-31', status:'needed', pricingMethod:'per_m2', totalAmount:'', labourAmount:'', materialsAmount:'', vatRate:'20', vatAmount:'', scopeOfWorks:'LVT click floor to lounge, kitchen, hallway (est 45m²). Carpet to 5 bedrooms (est 65m²). Tiles to bathroom/en-suite (est 18m²).', included:'', excluded:'', startAvailability:'', leadTimeWeeks:'', noticeDays:'', estimatedDurationWeeks:'', dependencies:['Plasterer','Painter/Decorator'], paymentTerms:'', warranty:'', insuranceChecked:false, certifications:[], notes:'Need to get 3 quotes — flooring not yet priced.', rating:{ priceLevel:0, reliability:0, quality:0, quoteSpeed:0, communication:0, availability:0, flipExperience:0, wouldUseAgain:true, overallRating:0 }, createdAt:now },
                  ];
                  setRefurbQuotes(prev => [...prev, ...samples]);
                };

                // ── sub-tab nav style helper ──────────────────────────────────
                const stBtn = (k, label) => (
                  <button key={k} onClick={() => setRfSubTab(k)} style={{ padding: isMobile ? '7px 12px' : '8px 16px', borderRadius:'7px', border:'none', cursor:'pointer', fontSize: isMobile ? '11px' : '12px', fontWeight:'600', backgroundColor: rfSubTab===k ? '#b45309' : '#fff', color: rfSubTab===k ? '#fff' : '#64748b', transition:'background .15s', whiteSpace:'nowrap' }}>{label}</button>
                );

                return (
                  <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '12px' : '20px 28px', display:'flex', flexDirection:'column', gap:'20px' }}>

                    {/* Sub-tab navigation */}
                    <div style={{ display:'flex', gap:'6px', overflowX:'auto', paddingBottom:'4px', flexWrap:'nowrap' }} className="crm-mobile-tab-scroll">
                      {stBtn('dashboard','📊 Dashboard')}
                      {stBtn('quotes','📋 All Quotes')}
                      {stBtn('mixer','🧮 Quote Mixer')}
                      {stBtn('pricebook','📖 Price Book')}
                      {stBtn('directory','🏗️ Trade Directory')}
                      {stBtn('timeline','📅 Timeline')}
                    </div>

                    {/* ── DASHBOARD ─────────────────────────────────────────── */}
                    {rfSubTab === 'dashboard' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                        {/* KPI row */}
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(6,1fr)', gap:'10px' }}>
                          {[
                            ['Total Quotes', totalQ, '#0f172a'],
                            ['Needed', neededQ, '#92400e'],
                            ['Received', receivedQ, '#6d28d9'],
                            ['Accepted', acceptedQ, '#166534'],
                            ['Booked / Active', bookedQ, '#065f46'],
                            ['Expiring ≤7d', expiringQ, expiringQ>0?'#dc2626':'#94a3b8'],
                          ].map(([label, val, color]) => (
                            <div key={label} style={{ backgroundColor:'#fff', padding:'14px 16px', borderRadius:'10px', border:'1px solid #e2e8f0' }}>
                              <div style={{ fontSize:'10px', color:'#64748b', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'4px' }}>{label}</div>
                              <div style={{ fontSize:'22px', fontWeight:'700', color }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Accepted value banner */}
                        <div style={{ backgroundColor:'#f0fdf4', border:'1px solid #a7f3d0', borderRadius:'10px', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'12px' }}>
                          <div>
                            <div style={{ fontSize:'11px', color:'#065f46', fontWeight:'600', textTransform:'uppercase', letterSpacing:'.05em' }}>Total Accepted Quote Value</div>
                            <div style={{ fontSize:'28px', fontWeight:'800', color:'#065f46' }}>{fmt(acceptedValue)}</div>
                          </div>
                          <div style={{ display:'flex', gap:'10px', flexWrap:'wrap' }}>
                            <button onClick={() => openAddQuote()} style={{ padding:'9px 18px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>+ Add Quote</button>
                            {refurbQuotes.length === 0 && (
                              <button onClick={loadSampleData} style={{ padding:'9px 18px', backgroundColor:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>Load sample data</button>
                            )}
                          </div>
                        </div>

                        {/* Status breakdown */}
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'14px' }}>
                          {/* By status */}
                          <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                            <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'14px' }}>Quotes by Status</div>
                            {QUOTE_STATUSES.map(s => {
                              const cnt = refurbQuotes.filter(q=>q.status===s).length;
                              const pct = totalQ>0 ? Math.round(cnt/totalQ*100) : 0;
                              const c = QUOTE_STATUS_COLORS[s]||{bg:'#f1f5f9',color:'#475569'};
                              return cnt > 0 ? (
                                <div key={s} style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'8px' }}>
                                  <div style={{ fontSize:'11px', fontWeight:'600', width:'90px', color:c.color, textTransform:'capitalize' }}>{s.replace('_',' ')}</div>
                                  <div style={{ flex:1, height:'8px', backgroundColor:'#f1f5f9', borderRadius:'4px', overflow:'hidden' }}>
                                    <div style={{ width:`${pct}%`, height:'100%', backgroundColor:c.color, borderRadius:'4px' }} />
                                  </div>
                                  <div style={{ fontSize:'11px', color:'#64748b', width:'30px', textAlign:'right' }}>{cnt}</div>
                                </div>
                              ) : null;
                            })}
                            {totalQ === 0 && <div style={{ fontSize:'12px', color:'#94a3b8' }}>No quotes yet — click "+ Add Quote" to start.</div>}
                          </div>

                          {/* By trade */}
                          <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                            <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'14px' }}>Quotes by Trade</div>
                            {(() => {
                              const tradeCounts = {};
                              refurbQuotes.forEach(q => { tradeCounts[q.tradeCategory] = (tradeCounts[q.tradeCategory]||0)+1; });
                              const sorted = Object.entries(tradeCounts).sort((a,b)=>b[1]-a[1]);
                              return sorted.length > 0 ? sorted.slice(0,10).map(([trade,cnt]) => (
                                <div key={trade} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid #f8fafc' }}>
                                  <span style={{ fontSize:'12px', color:'#334155' }}>{trade}</span>
                                  <span style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', backgroundColor:'#f1f5f9', padding:'1px 8px', borderRadius:'10px' }}>{cnt}</span>
                                </div>
                              )) : <div style={{ fontSize:'12px', color:'#94a3b8' }}>No data yet.</div>;
                            })()}
                          </div>
                        </div>

                        {/* Recent quotes */}
                        {refurbQuotes.length > 0 && (
                          <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a' }}>Recent Quotes</div>
                              <button onClick={()=>setRfSubTab('quotes')} style={{ fontSize:'11px', color:'#b45309', background:'none', border:'none', cursor:'pointer', fontWeight:'600' }}>View all →</button>
                            </div>
                            <div style={{ overflowX:'auto' }} className="crm-table-wrap">
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', minWidth: '600px' }}>
                                <thead>
                                  <tr style={{ backgroundColor:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                                    {['Trade','Property','Company / Contact','Amount','Status','Expiry'].map(h=>(
                                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:'600', color:'#64748b', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...refurbQuotes].sort((a,b)=>b.id-a.id).slice(0,8).map(q=>(
                                    <tr key={q.id} style={{ borderBottom:'1px solid #f1f5f9', cursor:'pointer' }} onClick={()=>openEditQuote(q)} onMouseEnter={e=>e.currentTarget.style.backgroundColor='#fafaf9'} onMouseLeave={e=>e.currentTarget.style.backgroundColor=''}>
                                      <td style={{ padding:'9px 12px', fontWeight:'600', color:'#0f172a' }}>{q.tradeCategory||'—'}</td>
                                      <td style={{ padding:'9px 12px', color:'#475569', maxWidth:'140px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getPropName(q.propertyId)}</td>
                                      <td style={{ padding:'9px 12px', color:'#475569' }}>{q.companyId ? getCompanyName(q.companyId) : q.contactId ? getContactName(q.contactId) : '—'}</td>
                                      <td style={{ padding:'9px 12px', fontWeight:'700', color:'#0f172a', whiteSpace:'nowrap' }}>{q.totalAmount ? fmt(q.totalAmount) : '—'}</td>
                                      <td style={{ padding:'9px 12px' }}>{statusBadge(q.status)}</td>
                                      <td style={{ padding:'9px 12px', color: q.expiryDate && q.expiryDate < today ? '#dc2626' : '#64748b', whiteSpace:'nowrap' }}>{q.expiryDate||'—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── ALL QUOTES ─────────────────────────────────────────── */}
                    {rfSubTab === 'quotes' && (
                      <div style={{ display:'flex', gap:'0', backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'12px', overflow:'hidden', minHeight:'400px' }}>
                        {/* Filter sidebar */}
                        {!isMobile && (
                          <div style={{ width:'190px', flexShrink:0, borderRight:'1px solid #f1f5f9', padding:'14px 14px', backgroundColor:'#fafafa', overflowY:'auto' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em' }}>Filters</div>
                              {(rfTradeFilter!=='ALL'||rfStatusFilter!=='ALL'||rfPropertyFilter!=='ALL'||rfCompanyFilter!=='ALL'||rfPricingFilter!=='ALL'||rfSearch) && (
                                <button onClick={()=>{ setRfTradeFilter('ALL'); setRfStatusFilter('ALL'); setRfPropertyFilter('ALL'); setRfCompanyFilter('ALL'); setRfPricingFilter('ALL'); setRfSearch(''); }} style={{ fontSize:'10px', color:'#b45309', background:'none', border:'none', cursor:'pointer', fontWeight:'600', padding:0 }}>Clear all</button>
                              )}
                            </div>
                            {/* Search */}
                            <div style={{ marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Search</div>
                              <div style={{ position:'relative' }}>
                                <Search size={11} style={{ position:'absolute', top:'8px', left:'8px', color:'#94a3b8', pointerEvents:'none' }} />
                                <input placeholder="Trade, company, ref…" value={rfSearch} onChange={e=>setRfSearch(e.target.value)} style={{ width:'100%', padding:'7px 7px 7px 24px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', boxSizing:'border-box', backgroundColor:'#fff' }} />
                              </div>
                            </div>
                            {/* Property */}
                            <div style={{ marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Property</div>
                              <select value={rfPropertyFilter} onChange={e=>setRfPropertyFilter(e.target.value)} style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', backgroundColor:'#fff' }}>
                                <option value="ALL">All properties</option>
                                {[...new Set(refurbQuotes.map(q=>q.propertyId).filter(Boolean))].map(pid=>(
                                  <option key={pid} value={String(pid)}>{getPropName(pid)}</option>
                                ))}
                              </select>
                            </div>
                            {/* Status chips */}
                            <div style={{ marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'6px' }}>Status</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px' }}>
                                {['ALL',...QUOTE_STATUSES].map(s => {
                                  const on = rfStatusFilter === s;
                                  return <button key={s} onClick={()=>setRfStatusFilter(s)} style={{ padding:'3px 8px', borderRadius:'20px', border:`1px solid ${on?'#b45309':'#e2e8f0'}`, background:on?'#b45309':'#fff', color:on?'#fff':'#64748b', fontSize:'10px', fontWeight:'600', cursor:'pointer' }}>{s==='ALL'?'All':s.replace('_',' ')}</button>;
                                })}
                              </div>
                            </div>
                            {/* Trade */}
                            <div style={{ marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Trade</div>
                              <select value={rfTradeFilter} onChange={e=>setRfTradeFilter(e.target.value)} style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', backgroundColor:'#fff' }}>
                                <option value="ALL">All trades</option>
                                {TRADE_CATEGORIES.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            {/* Pricing method */}
                            <div style={{ marginBottom:'14px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Pricing method</div>
                              <select value={rfPricingFilter} onChange={e=>setRfPricingFilter(e.target.value)} style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', backgroundColor:'#fff' }}>
                                <option value="ALL">All methods</option>
                                {PRICING_METHODS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}
                              </select>
                            </div>
                            {/* Company */}
                            <div style={{ marginBottom:'6px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Company</div>
                              <select value={rfCompanyFilter} onChange={e=>setRfCompanyFilter(e.target.value)} style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', backgroundColor:'#fff' }}>
                                <option value="ALL">All companies</option>
                                {[...new Set(refurbQuotes.map(q=>q.companyId).filter(Boolean))].map(cid=>(
                                  <option key={cid} value={String(cid)}>{getCompanyName(cid)}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                        {/* Table area */}
                        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                          {/* Table toolbar */}
                          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', gap:'10px', backgroundColor:'#fff', flexShrink:0 }}>
                            {isMobile && (
                              <div style={{ position:'relative', flex:1 }}>
                                <Search size={11} style={{ position:'absolute', top:'8px', left:'8px', color:'#94a3b8', pointerEvents:'none' }} />
                                <input placeholder="Search…" value={rfSearch} onChange={e=>setRfSearch(e.target.value)} style={{ width:'100%', padding:'7px 7px 7px 24px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', boxSizing:'border-box' }} />
                              </div>
                            )}
                            <span style={{ fontSize:'11px', color:'#94a3b8' }}>{filteredQuotes.length} quote{filteredQuotes.length!==1?'s':''}{filteredQuotes.length !== refurbQuotes.length ? ` of ${refurbQuotes.length}` : ''}</span>
                            <div style={{ flex:1 }} />
                            <button onClick={()=>openAddQuote()} style={{ padding:'7px 14px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', cursor:'pointer', whiteSpace:'nowrap' }}>+ Add Quote</button>
                          </div>
                          {/* Table or empty state */}
                          {filteredQuotes.length === 0 ? (
                            <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'48px 24px', color:'#94a3b8' }}>
                              <div style={{ fontSize:'32px', marginBottom:'12px' }}>🔨</div>
                              <div style={{ fontSize:'14px', fontWeight:'600', marginBottom:'6px', color:'#475569' }}>{refurbQuotes.length===0 ? 'No quotes yet' : 'No quotes match your filters'}</div>
                              <div style={{ fontSize:'12px', marginBottom:'16px', textAlign:'center' }}>{refurbQuotes.length===0 ? 'Click "+ Add Quote" to add your first trade quote, or load sample data from the Dashboard.' : 'Try clearing some filters.'}</div>
                              {refurbQuotes.length===0 && <button onClick={()=>openAddQuote()} style={{ padding:'9px 20px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>+ Add First Quote</button>}
                            </div>
                          ) : (
                            <div style={{ flex:1, overflowX:'auto' }} className="crm-table-wrap">
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', minWidth:'700px' }}>
                                <thead>
                                  <tr style={{ backgroundColor:'#fafafa', borderBottom:'1px solid #f1f5f9' }}>
                                    {['Ref','Trade','Property','Company / Contact','Method','Net','Inc. VAT','Status','Expiry','Rating',''].map(h=>(
                                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {filteredQuotes.map(q=>{
                                    const isExpiring = q.expiryDate && !['accepted','rejected','booked','in_progress','complete','paid'].includes(q.status) && Math.ceil((new Date(q.expiryDate)-new Date())/86400000) <= 7 && Math.ceil((new Date(q.expiryDate)-new Date())/86400000) >= 0;
                                    const isExpired  = q.expiryDate && q.expiryDate < today && !['accepted','rejected','booked','in_progress','complete','paid'].includes(q.status);
                                    return (
                                      <tr key={q.id} style={{ borderBottom:'1px solid #f8fafc' }} onMouseEnter={e=>e.currentTarget.style.backgroundColor='#fafafa'} onMouseLeave={e=>e.currentTarget.style.backgroundColor=''}>
                                        <td style={{ padding:'10px 12px', fontSize:'10px', color:'#94a3b8', fontFamily:'monospace', whiteSpace:'nowrap' }}>{q.quoteRef||'—'}</td>
                                        <td style={{ padding:'10px 12px', fontWeight:'600', color:'#0f172a', whiteSpace:'nowrap' }}>{q.tradeCategory||'—'}</td>
                                        <td style={{ padding:'10px 12px', color:'#475569', maxWidth:'130px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getPropName(q.propertyId)}</td>
                                        <td style={{ padding:'10px 12px', color:'#334155' }}>
                                          <div style={{ fontWeight:'500', fontSize:'12px' }}>{q.companyId ? getCompanyName(q.companyId) : '—'}</div>
                                          {q.contactId && <div style={{ fontSize:'10px', color:'#94a3b8' }}>{getContactName(q.contactId)}</div>}
                                        </td>
                                        <td style={{ padding:'10px 12px', color:'#64748b', whiteSpace:'nowrap', fontSize:'11px' }}>{pmLabel(q.pricingMethod)}</td>
                                        <td style={{ padding:'10px 12px', fontWeight:'600', color: q.totalAmount ? '#0f172a' : '#94a3b8', whiteSpace:'nowrap' }}>{q.totalAmount ? fmt(q.totalAmount) : '—'}</td>
                                        <td style={{ padding:'10px 12px', color:'#475569', whiteSpace:'nowrap' }}>{q.totalAmount ? fmt(getQuoteTotal(q)) : '—'}</td>
                                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>{statusBadge(q.status)}</td>
                                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                                          {q.expiryDate ? (
                                            <span style={{ color: isExpired?'#dc2626' : isExpiring?'#d97706' : '#64748b', fontWeight: (isExpired||isExpiring)?'700':'400', fontSize:'11px' }}>
                                              {q.expiryDate}{isExpired?' ✕':''}
                                            </span>
                                          ) : <span style={{ color:'#94a3b8' }}>—</span>}
                                        </td>
                                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>{q.rating?.overallRating ? starRating(q.rating.overallRating) : <span style={{ color:'#cbd5e1', fontSize:'11px' }}>—</span>}</td>
                                        <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>
                                          <div style={{ display:'flex', gap:'5px' }}>
                                            <button onClick={()=>openEditQuote(q)} style={{ padding:'3px 9px', border:'1px solid #e2e8f0', borderRadius:'5px', fontSize:'11px', cursor:'pointer', backgroundColor:'#fff', color:'#475569', fontWeight:'500' }}>Edit</button>
                                            <button onClick={()=>deleteQuote(q.id)} style={{ padding:'3px 8px', border:'1px solid #fca5a5', borderRadius:'5px', fontSize:'11px', cursor:'pointer', backgroundColor:'#fff', color:'#dc2626' }}>✕</button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── QUOTE MIXER ────────────────────────────────────────── */}
                    {rfSubTab === 'mixer' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                        {/* Property selector */}
                        <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'12px' }}>Select Property to Build Cost Stack</div>
                          <div style={{ display:'flex', gap:'12px', flexWrap:'wrap', alignItems:'flex-end' }}>
                            <div style={{ flex:1, minWidth:'200px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Property</div>
                              <select value={mixerPropId} onChange={e=>{ setMixerPropId(e.target.value); setMixerSel({}); }} style={{ width:'100%', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff' }}>
                                <option value="">— Select a property —</option>
                                {properties.map(p=><option key={p.id} value={p.id}>{p.dealName||p.address?.split(',')[0]||p.address}</option>)}
                              </select>
                            </div>
                            <div style={{ minWidth:'120px' }}>
                              <div style={{ fontSize:'10px', fontWeight:'600', color:'#64748b', marginBottom:'4px', textTransform:'uppercase' }}>Contingency %</div>
                              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                <input type="number" min="0" max="50" value={mixerContingency} onChange={e=>setMixerContingency(parseFloat(e.target.value)||0)} style={{ width:'70px', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', textAlign:'center' }} />
                                <span style={{ fontSize:'12px', color:'#64748b' }}>%</span>
                              </div>
                            </div>
                            {mixerProperty && (
                              <button onClick={()=>openAddQuote({ propertyId: String(mixerProperty.id) })} style={{ padding:'9px 16px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>+ Add Quote for this Property</button>
                            )}
                          </div>
                          {mixerProperty && mixerProperty.analytics?.worksTotal && (
                            <div style={{ marginTop:'12px', padding:'10px 14px', backgroundColor:'#eff6ff', borderRadius:'7px', fontSize:'12px', color:'#1d4ed8' }}>
                              📊 Deal report benchmark: <strong>{fmt(mixerProperty.analytics.worksTotal)}</strong> (from your assessment report)
                            </div>
                          )}
                        </div>

                        {!mixerPropId ? (
                          <div style={{ textAlign:'center', padding:'48px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', backgroundColor:'#fff' }}>
                            <div style={{ fontSize:'32px', marginBottom:'12px' }}>🧮</div>
                            <div style={{ fontSize:'14px', fontWeight:'600' }}>Select a property above to build your cost stack</div>
                            <div style={{ fontSize:'12px', marginTop:'6px' }}>Mix and match quotes from different trades to calculate your total refurb cost.</div>
                          </div>
                        ) : mixerPropQuotes.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'36px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', backgroundColor:'#fff' }}>
                            <div style={{ fontSize:'14px', fontWeight:'600' }}>No quotes for {mixerProperty?.dealName || 'this property'} yet</div>
                            <div style={{ fontSize:'12px', marginTop:'6px', marginBottom:'16px' }}>Add quotes in the All Quotes tab first.</div>
                            <button onClick={()=>openAddQuote({ propertyId: String(mixerProperty.id) })} style={{ padding:'9px 20px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:'pointer' }}>+ Add First Quote</button>
                          </div>
                        ) : (
                          <div style={{ display:'flex', flexDirection: isMobile ? 'column' : 'row', gap:'16px', alignItems:'flex-start' }}>
                            {/* Trade selector panel */}
                            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'4px' }}>Select One Quote Per Trade</div>
                              {mixerTrades.map(trade => {
                                const tradeQuotes = mixerPropQuotes.filter(q=>q.tradeCategory===trade);
                                const selectedId = mixerSel[trade];
                                const selectedQ = tradeQuotes.find(q=>String(q.id)===String(selectedId));
                                return (
                                  <div key={trade} style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'9px', padding:'12px 14px', borderLeft: selectedId ? '3px solid #b45309' : '3px solid #e2e8f0' }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:'12px', flexWrap:'wrap' }}>
                                      <div style={{ fontWeight:'700', fontSize:'13px', color:'#0f172a', minWidth:'140px' }}>{trade}</div>
                                      <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, flexWrap:'wrap', justifyContent:'flex-end' }}>
                                        <select value={selectedId||''} onChange={e=>{ const v=e.target.value; setMixerSel(p=>v ? {...p,[trade]:v} : (({[trade]:_,...rest})=>rest)(p)); }} style={{ padding:'7px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', backgroundColor:'#fff', minWidth:'200px', flex:1 }}>
                                          <option value="">— Not selected —</option>
                                          {tradeQuotes.map(q=>(
                                            <option key={q.id} value={q.id}>
                                              {q.quoteRef ? `[${q.quoteRef}] ` : ''}{q.companyId?getCompanyName(q.companyId):q.contactId?getContactName(q.contactId):'Unknown'} — {q.totalAmount?fmt(q.totalAmount):'TBC'} ({pmLabel(q.pricingMethod)})
                                            </option>
                                          ))}
                                        </select>
                                        {selectedQ && (
                                          <div style={{ display:'flex', gap:'6px', alignItems:'center', fontSize:'12px', color:'#64748b', whiteSpace:'nowrap' }}>
                                            {statusBadge(selectedQ.status)}
                                            {selectedQ.rating?.overallRating ? starRating(selectedQ.rating.overallRating) : null}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    {selectedQ && (
                                      <div style={{ marginTop:'8px', fontSize:'11px', color:'#64748b', display:'flex', gap:'16px', flexWrap:'wrap' }}>
                                        {selectedQ.labourAmount && <span>Labour: <strong>{fmt(selectedQ.labourAmount)}</strong></span>}
                                        {selectedQ.materialsAmount && <span>Materials: <strong>{fmt(selectedQ.materialsAmount)}</strong></span>}
                                        {selectedQ.vatRate && <span>VAT: <strong>{selectedQ.vatRate}%</strong></span>}
                                        {selectedQ.estimatedDurationWeeks && <span>Duration: <strong>{selectedQ.estimatedDurationWeeks} wk{selectedQ.estimatedDurationWeeks>1?'s':''}</strong></span>}
                                        {selectedQ.startAvailability && <span>Avail: <strong>{selectedQ.startAvailability}</strong></span>}
                                        {selectedQ.insuranceChecked && <span style={{ color:'#166534' }}>✓ Insured</span>}
                                      </div>
                                    )}
                                    {selectedQ && (selectedQ.lineItems || []).length > 0 && (
                                      <div style={{ marginTop:'6px', padding:'8px 10px', background:'#f8fafc', borderRadius:'7px', border:'1px solid #f1f5f9' }}>
                                        {selectedQ.lineItems.map(li => (
                                          <div key={li.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'11px', color:'#475569', padding:'2px 0' }}>
                                            <span>{li.description || '—'}{parseFloat(li.qty) > 1 ? ` × ${li.qty}` : ''}</span>
                                            <span style={{ fontWeight:'600' }}>{fmt((parseFloat(li.qty) || 1) * (parseFloat(li.unitPrice) || 0))}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {/* Totals panel */}
                            <div style={{ width: isMobile ? '100%' : '320px', flexShrink:0, display:'flex', flexDirection:'column', gap:'12px', position: isMobile ? 'static' : 'sticky', top:'0' }}>
                              <div style={{ backgroundColor:'#0f172a', borderRadius:'12px', padding:'20px' }}>
                                <div style={{ fontSize:'11px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.07em', marginBottom:'16px' }}>Cost Stack Summary</div>
                                {[
                                  ['Labour', mLabour, mLabour>0],
                                  ['Materials', mMats, mMats>0],
                                  ['Sub-Total', mSubtotal, true],
                                  ['VAT', mVAT, true],
                                  [`Contingency (${mixerContingency}%)`, mContingencyAmt, true],
                                ].map(([label, val, show]) => show ? (
                                  <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #1e293b' }}>
                                    <span style={{ fontSize:'12px', color:'#94a3b8' }}>{label}</span>
                                    <span style={{ fontSize:'12px', fontWeight:'700', color: val===0?'#475569':'#e2e8f0' }}>{val>0?fmt(val):'£0'}</span>
                                  </div>
                                ) : null)}
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'12px', paddingTop:'12px', borderTop:'2px solid #334155' }}>
                                  <span style={{ fontSize:'14px', fontWeight:'700', color:'#fff' }}>GRAND TOTAL</span>
                                  <span style={{ fontSize:'20px', fontWeight:'800', color:'#f0a44f' }}>{fmt(mGrand)}</span>
                                </div>
                                {mDurationWks > 0 && (
                                  <div style={{ marginTop:'12px', fontSize:'11px', color:'#64748b', textAlign:'center' }}>Estimated duration: {mDurationWks.toFixed(1)} weeks</div>
                                )}
                              </div>

                              {selectedQuotes.length > 0 && (
                                <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px' }}>
                                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#0f172a', marginBottom:'10px' }}>Selected — {selectedQuotes.length} of {mixerTrades.length} trades</div>
                                  {(() => {
                                    // Find cheapest combination hint
                                    const unselected = mixerTrades.filter(t=>!mixerSel[t]);
                                    return (
                                      <>
                                        {unselected.length > 0 && (
                                          <div style={{ padding:'8px 10px', backgroundColor:'#fef3c7', borderRadius:'7px', fontSize:'11px', color:'#92400e', marginBottom:'8px' }}>
                                            ⚠️ {unselected.length} trade{unselected.length>1?'s':''} not selected: {unselected.join(', ')}
                                          </div>
                                        )}
                                        <div style={{ padding:'8px 10px', backgroundColor:'#f0fdf4', borderRadius:'7px', fontSize:'11px', color:'#166534' }}>
                                          ✓ {selectedQuotes.filter(q=>q.insuranceChecked).length}/{selectedQuotes.length} trades insured
                                        </div>
                                      </>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* Comparison: cheapest vs highest rated */}
                              {mixerTrades.length > 0 && (
                                <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px' }}>
                                  <div style={{ fontSize:'11px', fontWeight:'700', color:'#0f172a', marginBottom:'10px' }}>Auto-Select Options</div>
                                  <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
                                    <button onClick={()=>{
                                      const sel = {};
                                      mixerTrades.forEach(t => {
                                        const opts = mixerPropQuotes.filter(q=>q.tradeCategory===t && q.totalAmount);
                                        if(opts.length>0) { const cheapest = opts.reduce((a,b)=>(parseFloat(a.totalAmount)||999999)<=(parseFloat(b.totalAmount)||999999)?a:b); sel[t]=String(cheapest.id); }
                                      });
                                      setMixerSel(sel);
                                    }} style={{ padding:'7px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', cursor:'pointer', backgroundColor:'#f8fafc', color:'#475569', fontWeight:'600', textAlign:'left' }}>💰 Select cheapest per trade</button>
                                    <button onClick={()=>{
                                      const sel = {};
                                      mixerTrades.forEach(t => {
                                        const opts = mixerPropQuotes.filter(q=>q.tradeCategory===t && q.rating?.overallRating>0);
                                        if(opts.length>0) { const best = opts.reduce((a,b)=>(a.rating?.overallRating||0)>=(b.rating?.overallRating||0)?a:b); sel[t]=String(best.id); }
                                        else { const any = mixerPropQuotes.filter(q=>q.tradeCategory===t); if(any.length>0) sel[t]=String(any[0].id); }
                                      });
                                      setMixerSel(sel);
                                    }} style={{ padding:'7px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', cursor:'pointer', backgroundColor:'#f8fafc', color:'#475569', fontWeight:'600', textAlign:'left' }}>⭐ Select highest rated per trade</button>
                                    <button onClick={()=>{
                                      const sel = {};
                                      mixerTrades.forEach(t => {
                                        const opts = mixerPropQuotes.filter(q=>q.tradeCategory===t && q.estimatedDurationWeeks);
                                        if(opts.length>0) { const fastest = opts.reduce((a,b)=>(parseFloat(a.estimatedDurationWeeks)||999)<=(parseFloat(b.estimatedDurationWeeks)||999)?a:b); sel[t]=String(fastest.id); }
                                        else { const any = mixerPropQuotes.filter(q=>q.tradeCategory===t); if(any.length>0) sel[t]=String(any[0].id); }
                                      });
                                      setMixerSel(sel);
                                    }} style={{ padding:'7px 12px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'11px', cursor:'pointer', backgroundColor:'#f8fafc', color:'#475569', fontWeight:'600', textAlign:'left' }}>⚡ Select fastest per trade</button>
                                    <button onClick={()=>setMixerSel({})} style={{ padding:'7px 12px', border:'1px solid #fca5a5', borderRadius:'6px', fontSize:'11px', cursor:'pointer', backgroundColor:'#fff', color:'#dc2626', fontWeight:'600', textAlign:'left' }}>✕ Clear all selections</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ── TRADE DIRECTORY ───────────────────────────────────── */}
                    {rfSubTab === 'directory' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'10px' }}>
                          <div style={{ fontSize:'13px', fontWeight:'600', color:'#0f172a' }}>Trade Companies & Contacts</div>
                          <div style={{ display:'flex', gap:'8px' }}>
                            <button onClick={()=>{ setActiveTab('companies'); }} style={{ padding:'7px 14px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#475569', backgroundColor:'#fff', cursor:'pointer' }}>Manage Companies →</button>
                            <button onClick={()=>{ setActiveTab('contacts'); }} style={{ padding:'7px 14px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'12px', fontWeight:'600', color:'#475569', backgroundColor:'#fff', cursor:'pointer' }}>Manage Contacts →</button>
                          </div>
                        </div>

                        {/* Trade companies with aggregated quote stats */}
                        <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'14px' }}>Companies (Trade / Contractor type)</div>
                          {(() => {
                            const tradeCompanies = companies.filter(c=>c.type==='Trade / Contractor');
                            if(tradeCompanies.length===0) return (
                              <div style={{ fontSize:'12px', color:'#94a3b8', padding:'12px 0' }}>
                                No companies with type "Trade / Contractor" yet. Add trade companies in the Companies tab and set their type to "Trade / Contractor".
                              </div>
                            );
                            return (
                              <div style={{ overflowX:'auto' }} className="crm-table-wrap">
                                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'12px', minWidth:'600px' }}>
                                  <thead>
                                    <tr style={{ backgroundColor:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                                      {['Company','City','Quotes','Avg Quote','Avg Rating','Insured','Actions'].map(h=>(
                                        <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:'10px', fontWeight:'600', color:'#64748b', textTransform:'uppercase' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tradeCompanies.map(c => {
                                      const cq = refurbQuotes.filter(q=>q.companyId===c.id && q.totalAmount);
                                      const avgQuote = cq.length > 0 ? cq.reduce((s,q)=>s+(parseFloat(q.totalAmount)||0),0)/cq.length : null;
                                      const rated = refurbQuotes.filter(q=>q.companyId===c.id && q.rating?.overallRating>0);
                                      const avgRating = rated.length > 0 ? rated.reduce((s,q)=>s+(q.rating.overallRating||0),0)/rated.length : null;
                                      const insured = refurbQuotes.some(q=>q.companyId===c.id && q.insuranceChecked);
                                      return (
                                        <tr key={c.id} style={{ borderBottom:'1px solid #f1f5f9' }} onMouseEnter={e=>e.currentTarget.style.backgroundColor='#fafafa'} onMouseLeave={e=>e.currentTarget.style.backgroundColor=''}>
                                          <td style={{ padding:'10px 12px', fontWeight:'600', color:'#0f172a' }}>{c.name}</td>
                                          <td style={{ padding:'10px 12px', color:'#64748b' }}>{c.city||'—'}</td>
                                          <td style={{ padding:'10px 12px', color:'#64748b' }}>{refurbQuotes.filter(q=>q.companyId===c.id).length}</td>
                                          <td style={{ padding:'10px 12px', color:'#0f172a', fontWeight:'600' }}>{avgQuote ? fmt(avgQuote) : '—'}</td>
                                          <td style={{ padding:'10px 12px' }}>{avgRating ? <><span style={{ color:'#eab308' }}>{'★'.repeat(Math.round(avgRating))}</span> <span style={{ fontSize:'10px', color:'#64748b' }}>({avgRating.toFixed(1)})</span></> : '—'}</td>
                                          <td style={{ padding:'10px 12px' }}>{insured ? <span style={{ color:'#166534', fontWeight:'600' }}>✓ Yes</span> : <span style={{ color:'#94a3b8' }}>Not checked</span>}</td>
                                          <td style={{ padding:'10px 12px' }}>
                                            <button onClick={()=>openAddQuote({ companyId:String(c.id) })} style={{ padding:'4px 10px', border:'1px solid #b45309', borderRadius:'5px', fontSize:'11px', cursor:'pointer', backgroundColor:'#fff', color:'#b45309', fontWeight:'600' }}>+ Quote</button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Trade contacts */}
                        <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'14px' }}>Individual Tradespeople (Contacts)</div>
                          {(() => {
                            const tradeContacts = contacts.filter(c=>{
                              const co = companies.find(x=>x.id===c.companyId);
                              return co?.type==='Trade / Contractor' || ['Electrician','Plumber','Builder','Plasterer','Decorator','Roofer','Carpenter','Tradesperson','Trade'].includes(c.role);
                            });
                            if(tradeContacts.length===0) return (
                              <div style={{ fontSize:'12px', color:'#94a3b8' }}>No trade contacts found. Add contacts linked to Trade / Contractor companies, or with a trade role.</div>
                            );
                            return (
                              <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap:'10px' }}>
                                {tradeContacts.map(c => {
                                  const co = companies.find(x=>x.id===c.companyId);
                                  const cq = refurbQuotes.filter(q=>q.contactId===c.id);
                                  const rated = cq.filter(q=>q.rating?.overallRating>0);
                                  const avgR = rated.length>0 ? rated.reduce((s,q)=>s+(q.rating.overallRating||0),0)/rated.length : null;
                                  return (
                                    <div key={c.id} style={{ border:'1px solid #e2e8f0', borderRadius:'9px', padding:'12px 14px', backgroundColor:'#f8fafc' }}>
                                      <div style={{ fontWeight:'700', fontSize:'13px', color:'#0f172a' }}>{c.name}</div>
                                      {co && <div style={{ fontSize:'11px', color:'#64748b', marginTop:'2px' }}>{co.name}</div>}
                                      <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'2px' }}>{c.role||c.jobTitle||'—'} · {c.phone||c.email||'—'}</div>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'8px' }}>
                                        <div style={{ fontSize:'11px', color:'#64748b' }}>{cq.length} quote{cq.length!==1?'s':''} · {avgR ? <><span style={{ color:'#eab308' }}>{'★'.repeat(Math.round(avgR))}</span> {avgR.toFixed(1)}</> : 'Unrated'}</div>
                                        <button onClick={()=>openAddQuote({ contactId:String(c.id), companyId:String(c.companyId||'') })} style={{ padding:'4px 9px', border:'1px solid #b45309', borderRadius:'5px', fontSize:'10px', cursor:'pointer', backgroundColor:'#fff', color:'#b45309', fontWeight:'700' }}>+ Quote</button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>

                        {/* Trade info checklists */}
                        <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'4px' }}>Pre-Quote Information Checklist</div>
                          <div style={{ fontSize:'11px', color:'#64748b', marginBottom:'14px' }}>Information you'll typically need before a contractor can quote accurately.</div>
                          <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px,1fr))', gap:'12px' }}>
                            {Object.entries(TRADE_INFO_NEEDED).map(([trade, items]) => (
                              <div key={trade} style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px' }}>
                                <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'8px' }}>{trade}</div>
                                <ul style={{ margin:0, paddingLeft:'16px', display:'flex', flexDirection:'column', gap:'3px' }}>
                                  {items.map(item=><li key={item} style={{ fontSize:'11px', color:'#64748b' }}>{item}</li>)}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── TRADE PRICE BOOK ──────────────────────────────────── */}
                    {rfSubTab === 'pricebook' && (() => {
                      const bookByTrade = {};
                      catalogTrades.forEach(e => { (bookByTrade[e.trade] = bookByTrade[e.trade] || []).push(e); });
                      const bookTrades = Object.keys(bookByTrade).sort((a, b) => TRADE_SEQUENCE.indexOf(a) - TRADE_SEQUENCE.indexOf(b));
                      const updateEntry = (id, patch) => setCatalogTrades(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
                      const deleteEntry = (id) => { if (window.confirm('Remove this job type from the price book?')) setCatalogTrades(prev => prev.filter(e => e.id !== id)); };
                      // Vendor track record — aggregated from every rated quote
                      const vendorStats = {};
                      refurbQuotes.forEach(q => {
                        if (!q.companyId) return;
                        const v = vendorStats[q.companyId] = vendorStats[q.companyId] || { companyId: q.companyId, quotes: 0, rated: 0, overall: 0, reliability: 0, quoteSpeed: 0, wouldUse: 0, trades: new Set() };
                        v.quotes++;
                        if (q.tradeCategory) v.trades.add(q.tradeCategory);
                        const r = q.rating || {};
                        if (r.overallRating > 0) { v.rated++; v.overall += r.overallRating; v.reliability += r.reliability || 0; v.quoteSpeed += r.quoteSpeed || 0; if (r.wouldUseAgain) v.wouldUse++; }
                      });
                      const vendorRows = Object.values(vendorStats).sort((a, b) => b.quotes - a.quotes);
                      const cellS = { padding:'8px 10px', fontSize:'12px', color:'#334155' };
                      const headS = { padding:'8px 10px', textAlign:'left', fontSize:'10px', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.04em' };
                      const numIn = (val, onCh, w='72px') => <input type="number" value={val ?? ''} onChange={e => onCh(e.target.value === '' ? null : parseFloat(e.target.value))} style={{ width:w, padding:'5px 7px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', boxSizing:'border-box' }} />;
                      return (
                        <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                          {/* Add job type */}
                          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px 16px' }}>
                            <div style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'10px' }}>Add job type to price book</div>
                            <form onSubmit={e => { e.preventDefault(); const f = e.target; const trade = f.pbTrade.value, jobType = f.pbJob.value.trim(), price = parseFloat(f.pbPrice.value) || 0, unit = f.pbUnit.value; if (!trade || !jobType) return; setCatalogTrades(prev => [...prev, { id: Date.now(), trade, jobType, unit, lowPrice: price || null, typicalPrice: price || null, highPrice: price || null, preferredCompanyId: null, alternateCompanyIds: [], notes: '', samples: price ? [{ price, date: new Date().toISOString().split('T')[0] }] : [], createdAt: new Date().toISOString().split('T')[0] }]); f.reset(); }} style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '2fr 3fr 1fr 1fr auto', gap:'8px', alignItems:'end' }}>
                              <select name="pbTrade" defaultValue="" style={{ padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', background:'#fff' }}>
                                <option value="">— Trade —</option>
                                {TRADE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                              <input name="pbJob" placeholder="Job type — e.g. Full rewire (3-bed)" style={{ padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px' }} />
                              <input name="pbPrice" type="number" placeholder="Typical £" style={{ padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px' }} />
                              <select name="pbUnit" defaultValue="job" style={{ padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', background:'#fff' }}>
                                {['job','day','m²','room','item','socket','radiator','linear m'].map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                              <button type="submit" style={{ padding:'8px 16px', background:'#b45309', color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>Add</button>
                            </form>
                            <div style={{ fontSize:'11px', color:'#94a3b8', marginTop:'8px' }}>Prices also flow in automatically when you press “→ book” on a quote line item — each real quote refines the typical range.</div>
                          </div>

                          {/* Price book by trade */}
                          {catalogTrades.length === 0 && (
                            <div style={{ textAlign:'center', padding:'36px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', background:'#fff' }}>
                              <div style={{ fontSize:'13px', fontWeight:'600' }}>Price book is empty</div>
                              <div style={{ fontSize:'11px', marginTop:'3px' }}>Add job types above, or save prices from real quote line items</div>
                            </div>
                          )}
                          {bookTrades.map(trade => (
                            <div key={trade} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' }}>
                              <div style={{ padding:'10px 16px', background:'#fffbeb', borderBottom:'1px solid #fde68a', fontSize:'12px', fontWeight:'700', color:'#92400e' }}>{trade}</div>
                              <div style={{ overflowX:'auto' }} className="crm-table-wrap">
                              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'760px' }}>
                                <thead><tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                                  <th style={headS}>Job type</th><th style={headS}>Unit</th><th style={headS}>Low £</th><th style={headS}>Typical £</th><th style={headS}>High £</th><th style={headS}>Samples</th><th style={headS}>Preferred vendor</th><th style={headS}>Alternates</th><th style={headS}></th>
                                </tr></thead>
                                <tbody>
                                  {bookByTrade[trade].map(e => (
                                    <tr key={e.id} style={{ borderBottom:'1px solid #f8fafc' }}>
                                      <td style={{ ...cellS, fontWeight:'600', color:'#0f172a' }}>{e.jobType}</td>
                                      <td style={cellS}>{e.unit || 'job'}</td>
                                      <td style={cellS}>{numIn(e.lowPrice, v => updateEntry(e.id, { lowPrice: v }))}</td>
                                      <td style={cellS}>{numIn(e.typicalPrice, v => updateEntry(e.id, { typicalPrice: v }))}</td>
                                      <td style={cellS}>{numIn(e.highPrice, v => updateEntry(e.id, { highPrice: v }))}</td>
                                      <td style={{ ...cellS, textAlign:'center' }}>{(e.samples || []).length}</td>
                                      <td style={cellS}>
                                        <select value={e.preferredCompanyId || ''} onChange={ev => updateEntry(e.id, { preferredCompanyId: parseInt(ev.target.value) || null })} style={{ padding:'5px 7px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', background:'#fff', maxWidth:'140px' }}>
                                          <option value="">—</option>
                                          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                      </td>
                                      <td style={cellS}>
                                        <div style={{ display:'flex', gap:'4px', alignItems:'center', flexWrap:'wrap' }}>
                                          {(e.alternateCompanyIds || []).map(cid => (
                                            <span key={cid} style={{ fontSize:'10px', padding:'2px 7px', background:'#f1f5f9', borderRadius:'10px', color:'#475569', whiteSpace:'nowrap' }}>
                                              {companies.find(c => c.id === cid)?.name || cid}
                                              <button onClick={() => updateEntry(e.id, { alternateCompanyIds: (e.alternateCompanyIds || []).filter(x => x !== cid) })} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'10px', padding:'0 0 0 4px' }}>✕</button>
                                            </span>
                                          ))}
                                          <select value="" onChange={ev => { const cid = parseInt(ev.target.value); if (cid && !(e.alternateCompanyIds || []).includes(cid)) updateEntry(e.id, { alternateCompanyIds: [...(e.alternateCompanyIds || []), cid] }); }} style={{ padding:'3px 5px', border:'1px dashed #e2e8f0', borderRadius:'6px', fontSize:'10px', background:'#fff', color:'#94a3b8', width:'50px' }}>
                                            <option value="">+ alt</option>
                                            {companies.filter(c => c.id !== e.preferredCompanyId && !(e.alternateCompanyIds || []).includes(c.id)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                          </select>
                                        </div>
                                      </td>
                                      <td style={cellS}><button onClick={() => deleteEntry(e.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'#dc2626', fontSize:'12px' }}>✕</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          ))}

                          {/* Vendor track record */}
                          <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' }}>
                            <div style={{ padding:'10px 16px', borderBottom:'1px solid #e2e8f0', fontSize:'12px', fontWeight:'700', color:'#0f172a' }}>Vendor track record <span style={{ fontWeight:'400', color:'#94a3b8' }}>— aggregated from every rated quote</span></div>
                            {vendorRows.length === 0 && <div style={{ padding:'20px', fontSize:'12px', color:'#94a3b8' }}>No quotes linked to companies yet — link quotes to companies to build reliability history.</div>}
                            {vendorRows.length > 0 && (
                              <div style={{ overflowX:'auto' }} className="crm-table-wrap">
                              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:'640px' }}>
                                <thead><tr style={{ borderBottom:'1px solid #f1f5f9' }}>
                                  <th style={headS}>Vendor</th><th style={headS}>Trades</th><th style={headS}>Quotes</th><th style={headS}>Avg rating</th><th style={headS}>Reliability</th><th style={headS}>Quote speed</th><th style={headS}>Would use again</th>
                                </tr></thead>
                                <tbody>
                                  {vendorRows.map(v => (
                                    <tr key={v.companyId} style={{ borderBottom:'1px solid #f8fafc' }}>
                                      <td style={{ ...cellS, fontWeight:'600', color:'#0f172a' }}>{getCompanyName(v.companyId)}</td>
                                      <td style={cellS}>{[...v.trades].join(', ') || '—'}</td>
                                      <td style={{ ...cellS, textAlign:'center' }}>{v.quotes}</td>
                                      <td style={cellS}>{v.rated ? starRating(v.overall / v.rated) : '—'}</td>
                                      <td style={cellS}>{v.rated ? starRating(v.reliability / v.rated) : '—'}</td>
                                      <td style={cellS}>{v.rated ? starRating(v.quoteSpeed / v.rated) : '—'}</td>
                                      <td style={{ ...cellS, textAlign:'center' }}>{v.rated ? `${Math.round(v.wouldUse / v.rated * 100)}%` : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── TIMELINE & DEPENDENCIES ───────────────────────────── */}
                    {rfSubTab === 'timeline' && (
                      <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
                        <div style={{ backgroundColor:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'18px' }}>
                          <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'12px' }}>Select Property</div>
                          <select value={tlPropId} onChange={e=>setTlPropId(e.target.value)} style={{ padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', minWidth:'260px' }}>
                            <option value="">— Select property —</option>
                            {properties.map(p=><option key={p.id} value={p.id}>{p.dealName||p.address?.split(',')[0]||p.address}</option>)}
                          </select>
                        </div>

                        {!tlPropId ? (
                          <div style={{ textAlign:'center', padding:'48px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', backgroundColor:'#fff' }}>
                            <div style={{ fontSize:'28px', marginBottom:'12px' }}>📅</div>
                            <div style={{ fontSize:'14px', fontWeight:'600' }}>Select a property to view the trade timeline</div>
                          </div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                            <div style={{ padding:'10px 14px', backgroundColor:'#fef9c3', border:'1px solid #fde047', borderRadius:'8px', fontSize:'11px', color:'#854d0e' }}>
                              ℹ️ Sequence below follows standard refurb build order. Dependencies show which trades must complete BEFORE each trade can start. Trades flagged in orange have unmet dependencies.
                            </div>
                            {(() => {
                              const propId = parseInt(tlPropId);
                              const propQuotes = refurbQuotes.filter(q=>q.propertyId===propId);
                              const acceptedTrades = new Set(propQuotes.filter(q=>['accepted','booked','in_progress','complete','paid'].includes(q.status)).map(q=>q.tradeCategory));
                              const activeTradesOnProp = [...new Set(propQuotes.map(q=>q.tradeCategory))];
                              const allTrades = [...new Set([...TRADE_SEQUENCE.filter(t=>activeTradesOnProp.includes(t)), ...activeTradesOnProp.filter(t=>!TRADE_SEQUENCE.includes(t))])];
                              if(allTrades.length===0) return (
                                <div style={{ textAlign:'center', padding:'36px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', backgroundColor:'#fff' }}>
                                  <div style={{ fontSize:'13px', fontWeight:'600' }}>No quotes for this property yet</div>
                                  <button onClick={()=>openAddQuote({ propertyId: tlPropId })} style={{ marginTop:'12px', padding:'8px 18px', backgroundColor:'#b45309', color:'#fff', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'700', cursor:'pointer' }}>+ Add Quote</button>
                                </div>
                              );
                              return allTrades.map((trade, idx) => {
                                const tradeQs = propQuotes.filter(q=>q.tradeCategory===trade);
                                const bestQ = tradeQs.find(q=>q.status==='accepted') || tradeQs.find(q=>q.status==='booked') || tradeQs[0];
                                const deps = TRADE_DEPS[trade] || [];
                                const activeDeps = deps.filter(d=>allTrades.includes(d));
                                const unmetDeps = activeDeps.filter(d=>!acceptedTrades.has(d));
                                const isBlocked = unmetDeps.length > 0;
                                const tradeStatus = bestQ?.status || 'needed';
                                const statusC = QUOTE_STATUS_COLORS[tradeStatus]||{bg:'#f1f5f9',color:'#64748b'};
                                return (
                                  <div key={trade} style={{ display:'flex', gap:'12px', alignItems:'flex-start' }}>
                                    {/* Step number */}
                                    <div style={{ width:'32px', height:'32px', borderRadius:'50%', backgroundColor: acceptedTrades.has(trade) ? '#059669' : isBlocked ? '#f97316' : '#e2e8f0', color: acceptedTrades.has(trade)||isBlocked ? '#fff' : '#94a3b8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:'700', flexShrink:0, marginTop:'4px' }}>{idx+1}</div>
                                    {/* Line */}
                                    <div style={{ width:'2px', position:'absolute', backgroundColor:'#e2e8f0', display:'none' }} />
                                    {/* Card */}
                                    <div style={{ flex:1, border:`1px solid ${isBlocked ? '#fed7aa' : acceptedTrades.has(trade) ? '#a7f3d0' : '#e2e8f0'}`, borderRadius:'9px', padding:'12px 14px', backgroundColor: isBlocked ? '#fffbeb' : acceptedTrades.has(trade) ? '#f0fdf4' : '#fff' }}>
                                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
                                        <div>
                                          <span style={{ fontSize:'13px', fontWeight:'700', color:'#0f172a' }}>{trade}</span>
                                          {isBlocked && <span style={{ marginLeft:'8px', fontSize:'10px', backgroundColor:'#fed7aa', color:'#92400e', padding:'2px 7px', borderRadius:'10px', fontWeight:'700' }}>⚠ Waiting on: {unmetDeps.join(', ')}</span>}
                                        </div>
                                        <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                                          {statusBadge(tradeStatus)}
                                          <span style={{ fontSize:'11px', color:'#64748b' }}>{tradeQs.length} quote{tradeQs.length!==1?'s':''}</span>
                                        </div>
                                      </div>
                                      {bestQ && (
                                        <div style={{ marginTop:'8px', fontSize:'11px', color:'#64748b', display:'flex', gap:'14px', flexWrap:'wrap' }}>
                                          {bestQ.totalAmount && <span>Best quote: <strong style={{ color:'#0f172a' }}>{fmt(bestQ.totalAmount)}</strong></span>}
                                          {bestQ.startAvailability && <span>Available: <strong>{bestQ.startAvailability}</strong></span>}
                                          {bestQ.estimatedDurationWeeks && <span>Duration: <strong>{bestQ.estimatedDurationWeeks} wk{bestQ.estimatedDurationWeeks>1?'s':''}</strong></span>}
                                          {bestQ.companyId && <span>Company: <strong>{getCompanyName(bestQ.companyId)}</strong></span>}
                                        </div>
                                      )}
                                      {activeDeps.length > 0 && (
                                        <div style={{ marginTop:'6px', fontSize:'10px', color:'#94a3b8' }}>
                                          Requires: {activeDeps.map(d=>(
                                            <span key={d} style={{ marginRight:'6px', padding:'1px 6px', borderRadius:'8px', backgroundColor: acceptedTrades.has(d)?'#dcfce7':'#fee2e2', color: acceptedTrades.has(d)?'#166534':'#991b1b', fontWeight:'600' }}>{acceptedTrades.has(d)?'✓':''} {d}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                );
              })()}

              {/* ==================== TAB: SPEC BUILDER ==================== */}
              {activeTab === 'spec' && (() => {
                const fmt = (n) => n ? `£${Number(n).toLocaleString('en-GB', { minimumFractionDigits:0, maximumFractionDigits:0 })}` : '—';
                const getItemNet = (i) => parseFloat(i.totalPrice) || (parseFloat(i.unitPrice||0) * parseFloat(i.quantity||1));
                const getItemGross = (i) => getItemNet(i) + (parseFloat(i.vatAmount) || getItemNet(i) * (parseFloat(i.vatRate||0)/100)) + parseFloat(i.deliveryCost||0);
                const selectedSpecItems = specItems.filter(i => i.isSelected);
                const subTabs = [
                  { k:'dashboard', label:'Dashboard' },
                  { k:'property', label:'Property spec' },
                  { k:'items', label:'All items' },
                  { k:'catalogue', label:'Catalogue' },
                  { k:'templates', label:'Templates' },
                  { k:'allowances', label:'Allowances' },
                ];
                const subTabStyle = (k) => ({
                  padding:'9px 16px', fontSize:'13px', border:'none', background:'none', cursor:'pointer', fontWeight:'500',
                  borderBottom: specSubTab===k ? '2px solid #b45309' : '2px solid transparent',
                  color: specSubTab===k ? '#92400e' : '#64748b',
                });
                const sBtn = (label, style={}) => ({
                  padding:'7px 14px', fontSize:'12px', borderRadius:'7px', cursor:'pointer', border:'1px solid #e2e8f0',
                  background:'#fff', color:'#475569', ...style,
                });
                const sBtnPrimary = { background:'#b45309', color:'#fff', border:'none' };
                const statusPill = (st) => {
                  const c = SPEC_STATUS_COLORS[st] || { bg:'#f1f5f9', color:'#475569' };
                  return <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background:c.bg, color:c.color, fontWeight:'500', whiteSpace:'nowrap' }}>{st}</span>;
                };
                const imgBox = (item, size=48) => (
                  <div style={{ width:size, height:size, minWidth:size, borderRadius:'7px', border:'1px solid #e2e8f0', overflow:'hidden', background:'#f8fafc', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {item.imageUrl
                      ? <img src={item.imageUrl} alt="" width={size} height={size} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none';}} />
                      : <FileText size={size===48?18:14} color="#cbd5e1" />}
                  </div>
                );
                const itemRow = (item, showRoom=false) => (
                  <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:'8px', marginBottom:'6px', background:'#fff' }}>
                    {imgBox(item)}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name || '—'}</div>
                      <div style={{ fontSize:'11px', color:'#64748b', marginTop:'1px' }}>
                        {[item.supplier, item.brand, item.sku && `SKU: ${item.sku}`, showRoom && item.room, item.leadTimeWeeks && parseFloat(item.leadTimeWeeks)>3 && <span key="lt" style={{color:'#b45309',fontWeight:'600'}}>⚠ {item.leadTimeWeeks} wk lead</span>].filter(Boolean).map((x,i)=><span key={i}>{i>0?' · ':''}{x}</span>)}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', minWidth:'70px' }}>
                      <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b' }}>{fmt(getItemNet(item))}</div>
                      {item.quantity && item.unit && <div style={{ fontSize:'11px', color:'#94a3b8' }}>{item.quantity} {item.unit}</div>}
                    </div>
                    {statusPill(item.purchaseStatus)}
                    <div style={{ display:'flex', gap:'2px' }}>
                      <button onClick={()=>{ setEditingSpecItemId(item.id); setSpecItemForm({...EMPTY_SPEC_ITEM,...item}); setSpecItemModalTab('product'); setShowSpecItemModal(true); }} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'#94a3b8', borderRadius:'4px' }}><Pencil size={13} /></button>
                      <button onClick={()=>{ const copy={...item,id:Date.now(),createdAt:new Date().toISOString().split('T')[0]}; setSpecItems(p=>[...p,copy]); }} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'#94a3b8', borderRadius:'4px' }}><Plus size={13} /></button>
                      <button onClick={()=>setSpecItems(p=>p.filter(x=>x.id!==item.id))} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'#94a3b8', borderRadius:'4px' }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
                // Prop for property-level views
                const specPropOptions = properties.filter(p=>specItems.some(i=>i.propertyId===String(p.id)));
                const viewProp = specViewPropId ? properties.find(p=>String(p.id)===specViewPropId) : null;
                const propItems = specViewPropId ? specItems.filter(i=>i.propertyId===specViewPropId) : [];
                const propRooms = [...new Set(propItems.map(i=>i.room).filter(Boolean))].sort();
                const activeRoomItems = specViewRoom ? propItems.filter(i=>i.room===specViewRoom) : propItems;
                const propCategories = [...new Set(activeRoomItems.map(i=>i.category).filter(Boolean))];
                // Allowance helpers
                const getAllowance = (propId, cat) => specAllowances.find(a=>a.propertyId===propId && a.category===cat)?.allowance || 0;
                const getCatTotal = (propId, cat) => specItems.filter(i=>i.propertyId===propId && i.category===cat && i.isSelected).reduce((s,i)=>s+getItemNet(i),0);

                return (
                  <div style={{ display:'flex', flexDirection:'column', flex:'1 1 0', minHeight:0, backgroundColor:'#f8fafc', borderRadius:'12px', border:'1px solid #e2e8f0', overflow:'hidden' }}>
                    {/* Sub-tab strip */}
                    <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', background:'#fff', padding:'0 8px', flexShrink:0 }}>
                      {subTabs.map(t=><button key={t.k} onClick={()=>setSpecSubTab(t.k)} style={subTabStyle(t.k)}>{t.label}</button>)}
                      <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'8px', padding:'0 8px' }}>
                        <button onClick={()=>{ setEditingSpecItemId(null); setSpecItemForm({...EMPTY_SPEC_ITEM}); setSpecItemModalTab('product'); setShowSpecItemModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary, padding:'6px 12px', fontSize:'12px' }}><Plus size={13} style={{marginRight:'4px'}} />Add item</button>
                      </div>
                    </div>

                    {/* ---- DASHBOARD ---- */}
                    {specSubTab==='dashboard' && (() => {
                      const allPropIds = [...new Set(specItems.map(i=>i.propertyId).filter(Boolean))];
                      const totalItems = specItems.length;
                      const totalSelected = selectedSpecItems.length;
                      const totalOrdered = specItems.filter(i=>i.purchaseStatus==='ordered').length;
                      const totalDelivered = specItems.filter(i=>i.purchaseStatus==='delivered').length;
                      const specValue = selectedSpecItems.reduce((s,i)=>s+getItemNet(i),0);
                      const specValueVAT = selectedSpecItems.reduce((s,i)=>s+getItemGross(i),0);
                      const kpiStyle = { background:'#fff', borderRadius:'8px', padding:'10px 14px', flex:1, minWidth:0, border:'1px solid #e2e8f0' };
                      // Allowance data across all properties
                      const allCats = [...new Set(specItems.map(i=>i.category).filter(Boolean))];
                      const recentItems = [...specItems].sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).slice(0,5);
                      // Built-in sample templates for quick start
                      const builtInTemplates = [
                        { id:'t-bth-basic', name:'Basic bathroom spec', category:'Bathroom', items:11, est:'~£1,000' },
                        { id:'t-bth-mid', name:'Mid-range bathroom', category:'Bathroom', items:11, est:'~£2,100' },
                        { id:'t-kitch', name:'Basic kitchen spec', category:'Kitchen', items:6, est:'~£1,600' },
                        { id:'t-floor', name:'Standard flooring spec', category:'Flooring', items:4, est:'~£900' },
                        { id:'t-paint', name:'Paint & decorating', category:'Paint & Decorating', items:5, est:'~£350' },
                        { id:'t-elec', name:'Sockets & lighting', category:'Electrical Materials', items:8, est:'~£280' },
                      ];
                      const catBadge = (cat) => <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background:'#fef3c7', color:'#92400e', fontWeight:'600' }}>{cat}</span>;
                      return (
                        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                          {/* Property selector */}
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                              <Building2 size={15} color="#94a3b8" />
                              <select value={specViewPropId} onChange={e=>{setSpecViewPropId(e.target.value); setSpecViewRoom('');}} style={{ fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', padding:'5px 10px', background:'#fff', color:'#1e293b' }}>
                                <option value="">All properties</option>
                                {properties.map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                              </select>
                            </div>
                            <button onClick={()=>setShowApplyTemplateModal(true)} style={sBtn('')}>Apply template to room</button>
                          </div>
                          {/* KPI row */}
                          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap' }}>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Total items</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#1e293b' }}>{totalItems}</div></div>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Selected</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#166534' }}>{totalSelected}</div></div>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Ordered</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#1e40af' }}>{totalOrdered}</div></div>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Delivered</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#0f766e' }}>{totalDelivered}</div></div>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Spec value</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#1e293b' }}>{fmt(specValue)}</div></div>
                            <div style={kpiStyle}><div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>Inc. VAT</div><div style={{ fontSize:'20px', fontWeight:'600', color:'#94a3b8' }}>{fmt(specValueVAT)}</div></div>
                          </div>
                          {/* Two-col: allowances + recent */}
                          <div style={{ display:'grid', gridTemplateColumns: isMobile?'1fr':'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
                            {/* Allowance vs actual */}
                            <div style={{ background:'#fff', borderRadius:'8px', border:'1px solid #e2e8f0', padding:'14px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'600', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'12px' }}>Allowance vs actual</div>
                              {allCats.length===0 && <div style={{ fontSize:'13px', color:'#94a3b8' }}>No items yet</div>}
                              {allCats.slice(0,5).map(cat=>{
                                const propId = specViewPropId || (allPropIds[0]||'');
                                const allow = getAllowance(propId, cat);
                                const actual = getCatTotal(propId, cat);
                                const pct = allow>0 ? Math.min(100, Math.round(actual/allow*100)) : actual>0 ? 100 : 0;
                                const over = allow>0 && actual>allow;
                                const near = allow>0 && !over && pct>=85;
                                const barColor = over?'#b45309':near?'#ca8a04':'#16a34a';
                                return (
                                  <div key={cat} style={{ marginBottom:'10px' }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'3px' }}>
                                      <span style={{ color:'#1e293b' }}>{cat}</span>
                                      <span style={{ color:over?'#b45309':'#166534', fontWeight:'600' }}>{fmt(actual)}{allow>0?' / '+fmt(allow):''}</span>
                                    </div>
                                    {allow>0 && <div style={{ height:'5px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:`${pct}%`, background:barColor, borderRadius:'3px' }} /></div>}
                                    {over && <div style={{ fontSize:'11px', color:'#b45309', fontWeight:'600', marginTop:'2px' }}>{fmt(actual-allow)} over allowance</div>}
                                  </div>
                                );
                              })}
                              {allCats.length>0 && <button onClick={()=>setSpecSubTab('allowances')} style={{ fontSize:'12px', color:'#b45309', background:'none', border:'none', cursor:'pointer', padding:'4px 0', marginTop:'4px' }}>Manage allowances →</button>}
                            </div>
                            {/* Recent items */}
                            <div style={{ background:'#fff', borderRadius:'8px', border:'1px solid #e2e8f0', padding:'14px' }}>
                              <div style={{ fontSize:'12px', fontWeight:'600', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'12px' }}>Recent items</div>
                              {recentItems.length===0 && <div style={{ fontSize:'13px', color:'#94a3b8' }}>No items yet. Add your first item or apply a template.</div>}
                              {recentItems.map(item=>(
                                <div key={item.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
                                  {imgBox(item, 36)}
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:'12px', fontWeight:'600', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name||'—'}</div>
                                    <div style={{ fontSize:'11px', color:'#64748b' }}>{[item.room, item.supplier].filter(Boolean).join(' · ')}</div>
                                  </div>
                                  <div style={{ fontSize:'12px', fontWeight:'600', color:'#1e293b' }}>{fmt(getItemNet(item))}</div>
                                  {statusPill(item.purchaseStatus)}
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Template library */}
                          <div style={{ fontSize:'12px', fontWeight:'600', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:'10px' }}>
                            Template library
                            <span style={{ fontWeight:'400', textTransform:'none', letterSpacing:0, color:'#94a3b8', marginLeft:'6px', fontSize:'12px' }}>— quick-apply to any room</span>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr 1fr':'repeat(3,1fr)', gap:'8px', marginBottom:'12px' }}>
                            {builtInTemplates.map(t=>(
                              <div key={t.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px' }}>
                                {catBadge(t.category)}
                                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b', margin:'6px 0 2px' }}>{t.name}</div>
                                <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'8px' }}>{t.items} items · {t.est}</div>
                                <button onClick={()=>{ setApplyTemplateSel(t.id); setShowApplyTemplateModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary, width:'100%', padding:'5px 8px', fontSize:'11px' }}>Apply to room</button>
                              </div>
                            ))}
                            {specTemplates.map(t=>(
                              <div key={t.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px' }}>
                                {catBadge(t.category||'Custom')}
                                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b', margin:'6px 0 2px' }}>{t.name}</div>
                                <div style={{ fontSize:'11px', color:'#94a3b8', marginBottom:'8px' }}>{(t.items||[]).length} items</div>
                                <div style={{ display:'flex', gap:'4px' }}>
                                  <button onClick={()=>{ setApplyTemplateSel(t.id); setShowApplyTemplateModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary, flex:1, padding:'5px 8px', fontSize:'11px' }}>Apply</button>
                                  <button onClick={()=>{ setEditingTemplateId(t.id); setTemplateForm({...EMPTY_SPEC_TEMPLATE,...t}); setTemplateEditTab('info'); setShowTemplateModal(true); }} style={{ ...sBtn(''), padding:'5px 8px', fontSize:'11px' }}>Edit</button>
                                </div>
                              </div>
                            ))}
                            <div style={{ background:'#f8fafc', border:'1px dashed #e2e8f0', borderRadius:'8px', padding:'12px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer', minHeight:'80px' }} onClick={()=>{ setEditingTemplateId(null); setTemplateForm({...EMPTY_SPEC_TEMPLATE}); setTemplateEditTab('info'); setShowTemplateModal(true); }}>
                              <Plus size={20} color="#94a3b8" />
                              <div style={{ fontSize:'12px', color:'#94a3b8', marginTop:'4px' }}>New template</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ---- PROPERTY SPEC ---- */}
                    {specSubTab==='property' && (() => {
                      return (
                        <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
                          {/* Property + room selector bar */}
                          <div style={{ padding:'10px 16px', borderBottom:'1px solid #e2e8f0', background:'#fff', display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', flexShrink:0 }}>
                            <select value={specViewPropId} onChange={e=>{setSpecViewPropId(e.target.value); setSpecViewRoom('');}} style={{ fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', padding:'6px 10px', background:'#fff', color:'#1e293b', minWidth:'200px' }}>
                              <option value="">— Select property —</option>
                              {properties.map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                            </select>
                            {viewProp && propRooms.length>0 && (
                              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                                <button onClick={()=>setSpecViewRoom('')} style={{ padding:'5px 12px', fontSize:'12px', borderRadius:'20px', border:'1px solid', borderColor:!specViewRoom?'#b45309':'#e2e8f0', background:!specViewRoom?'#b45309':'#fff', color:!specViewRoom?'#fff':'#64748b', cursor:'pointer', fontWeight:'500' }}>All</button>
                                {propRooms.map(r=><button key={r} onClick={()=>setSpecViewRoom(r)} style={{ padding:'5px 12px', fontSize:'12px', borderRadius:'20px', border:'1px solid', borderColor:specViewRoom===r?'#b45309':'#e2e8f0', background:specViewRoom===r?'#b45309':'#fff', color:specViewRoom===r?'#fff':'#64748b', cursor:'pointer', fontWeight:'500' }}>{r} ({propItems.filter(i=>i.room===r).length})</button>)}
                              </div>
                            )}
                            {viewProp && (
                              <div style={{ marginLeft:'auto', display:'flex', gap:'6px' }}>
                                <button onClick={()=>{ setApplyTemplatePropId(specViewPropId); setApplyTemplateRoom(specViewRoom); setShowApplyTemplateModal(true); }} style={sBtn('')}>Apply template</button>
                                <button onClick={()=>{ setSpecItemForm({...EMPTY_SPEC_ITEM, propertyId:specViewPropId, room:specViewRoom}); setEditingSpecItemId(null); setSpecItemModalTab('product'); setShowSpecItemModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary }}>+ Add item</button>
                              </div>
                            )}
                          </div>
                          {!specViewPropId ? (
                            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:'14px' }}>Select a property above to view its spec</div>
                          ) : (
                            <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>
                              {propCategories.length===0 && <div style={{ color:'#94a3b8', fontSize:'14px', marginTop:'20px' }}>No items for this property{specViewRoom?' in '+specViewRoom:''}. Add items or apply a template.</div>}
                              {propCategories.map(cat=>{
                                const catItems = activeRoomItems.filter(i=>i.category===cat);
                                const catTotal = catItems.filter(i=>i.isSelected).reduce((s,i)=>s+getItemNet(i),0);
                                return (
                                  <div key={cat} style={{ marginBottom:'18px' }}>
                                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                                      <span style={{ fontSize:'11px', fontWeight:'600', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em' }}>{cat}</span>
                                      <span style={{ fontSize:'12px', color:'#94a3b8' }}>{fmt(catTotal)} selected</span>
                                    </div>
                                    {catItems.map(item=>itemRow(item))}
                                  </div>
                                );
                              })}
                              {activeRoomItems.length>0 && (
                                <div style={{ padding:'10px 14px', background:'#fff', borderRadius:'8px', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'8px' }}>
                                  <span style={{ fontSize:'13px', color:'#64748b' }}>{specViewRoom||'All rooms'} total (selected items)</span>
                                  <div>
                                    <span style={{ fontSize:'14px', fontWeight:'700', color:'#1e293b' }}>{fmt(activeRoomItems.filter(i=>i.isSelected).reduce((s,i)=>s+getItemNet(i),0))} net</span>
                                    <span style={{ fontSize:'12px', color:'#94a3b8', marginLeft:'8px' }}>{fmt(activeRoomItems.filter(i=>i.isSelected).reduce((s,i)=>s+getItemGross(i),0))} inc. VAT</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* ---- ALL ITEMS ---- */}
                    {specSubTab==='items' && (() => {
                      let filtered = specItems;
                      if (specPropFilter!=='ALL') filtered = filtered.filter(i=>i.propertyId===specPropFilter);
                      if (specRoomFilter!=='ALL') filtered = filtered.filter(i=>i.room===specRoomFilter);
                      if (specCategoryFilter!=='ALL') filtered = filtered.filter(i=>i.category===specCategoryFilter);
                      if (specStatusFilter!=='ALL') filtered = filtered.filter(i=>i.purchaseStatus===specStatusFilter);
                      if (specSelectedOnly) filtered = filtered.filter(i=>i.isSelected);
                      if (specSearch) { const q=specSearch.toLowerCase(); filtered=filtered.filter(i=>(i.name||'').toLowerCase().includes(q)||(i.supplier||'').toLowerCase().includes(q)||(i.sku||'').toLowerCase().includes(q)); }
                      const filterRooms = specPropFilter!=='ALL' ? [...new Set(specItems.filter(i=>i.propertyId===specPropFilter).map(i=>i.room).filter(Boolean))] : [...new Set(specItems.map(i=>i.room).filter(Boolean))];
                      return (
                        <div style={{ display:'flex', flex:1, minHeight:0 }}>
                          {/* Filter sidebar */}
                          {!isMobile && (
                            <div style={{ width:'176px', minWidth:'176px', borderRight:'1px solid #e2e8f0', background:'#f8fafc', padding:'12px', overflowY:'auto', flexShrink:0 }}>
                              <input type="text" value={specSearch} onChange={e=>setSpecSearch(e.target.value)} placeholder="Search items…" style={{ width:'100%', padding:'6px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', boxSizing:'border-box', marginBottom:'10px' }} />
                              <div style={{ fontSize:'10px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', margin:'6px 0 4px', fontWeight:'600' }}>Property</div>
                              <select value={specPropFilter} onChange={e=>{ setSpecPropFilter(e.target.value); setSpecRoomFilter('ALL'); }} style={{ width:'100%', fontSize:'12px', padding:'5px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', boxSizing:'border-box', marginBottom:'8px' }}>
                                <option value="ALL">All properties</option>
                                {properties.filter(p=>specItems.some(i=>i.propertyId===String(p.id))).map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                              </select>
                              <div style={{ fontSize:'10px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', margin:'6px 0 4px', fontWeight:'600' }}>Room</div>
                              <select value={specRoomFilter} onChange={e=>setSpecRoomFilter(e.target.value)} style={{ width:'100%', fontSize:'12px', padding:'5px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', boxSizing:'border-box', marginBottom:'8px' }}>
                                <option value="ALL">All rooms</option>
                                {filterRooms.map(r=><option key={r} value={r}>{r}</option>)}
                              </select>
                              <div style={{ fontSize:'10px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', margin:'6px 0 4px', fontWeight:'600' }}>Category</div>
                              <select value={specCategoryFilter} onChange={e=>setSpecCategoryFilter(e.target.value)} style={{ width:'100%', fontSize:'12px', padding:'5px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', boxSizing:'border-box', marginBottom:'8px' }}>
                                <option value="ALL">All categories</option>
                                {SPEC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                              </select>
                              <div style={{ fontSize:'10px', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'.05em', margin:'6px 0 4px', fontWeight:'600' }}>Status</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'10px' }}>
                                {['ALL',...SPEC_ITEM_STATUSES].map(s=>{
                                  const c = s==='ALL'?null:SPEC_STATUS_COLORS[s];
                                  return <button key={s} onClick={()=>setSpecStatusFilter(s)} style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px', border:'1px solid', borderColor:specStatusFilter===s?(s==='ALL'?'#b45309':c?.color||'#b45309'):'#e2e8f0', background:specStatusFilter===s?(s==='ALL'?'#b45309':c?.bg||'#fef3c7'):'#fff', color:specStatusFilter===s?(s==='ALL'?'#fff':c?.color||'#92400e'):'#64748b', cursor:'pointer' }}>{s==='ALL'?'All':s}</button>;
                                })}
                              </div>
                              <label style={{ display:'flex', alignItems:'center', gap:'6px', fontSize:'12px', color:'#64748b', cursor:'pointer', marginBottom:'6px' }}>
                                <input type="checkbox" checked={specSelectedOnly} onChange={e=>setSpecSelectedOnly(e.target.checked)} /> Selected only
                              </label>
                              {(specSearch||specPropFilter!=='ALL'||specRoomFilter!=='ALL'||specCategoryFilter!=='ALL'||specStatusFilter!=='ALL'||specSelectedOnly) && (
                                <button onClick={()=>{ setSpecSearch(''); setSpecPropFilter('ALL'); setSpecRoomFilter('ALL'); setSpecCategoryFilter('ALL'); setSpecStatusFilter('ALL'); setSpecSelectedOnly(false); }} style={{ fontSize:'12px', color:'#b45309', background:'none', border:'none', cursor:'pointer', padding:'4px 0', marginTop:'6px' }}>Clear all filters</button>
                              )}
                            </div>
                          )}
                          {/* Items list */}
                          <div style={{ flex:1, overflowY:'auto', padding:'12px 14px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px' }}>
                              <span style={{ fontSize:'13px', color:'#64748b' }}>{filtered.length} item{filtered.length!==1?'s':''} · {fmt(filtered.filter(i=>i.isSelected).reduce((s,i)=>s+getItemNet(i),0))} selected</span>
                            </div>
                            {filtered.length===0 && <div style={{ color:'#94a3b8', fontSize:'14px', marginTop:'20px' }}>No items match these filters.</div>}
                            {filtered.map(item=>itemRow(item, true))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* ---- PRODUCT CATALOGUE ---- */}
                    {specSubTab==='catalogue' && (() => {
                      const visible = catalogProducts.filter(p => {
                        if (specCategoryFilter !== 'ALL' && p.category !== specCategoryFilter) return false;
                        if (specSearch.trim() && ![p.name, p.supplier, p.brand, p.sku].join(' ').toLowerCase().includes(specSearch.toLowerCase())) return false;
                        return true;
                      });
                      const useProduct = (p) => {
                        setEditingSpecItemId(null);
                        setSpecItemForm({ ...EMPTY_SPEC_ITEM, name: p.name || '', category: p.category || '', supplier: p.supplier || '', sku: p.sku || '', brand: p.brand || '', productUrl: p.productUrl || '', imageUrl: p.imageUrl || '', description: p.description || '', unit: p.unit || 'item', unitPrice: p.unitPrice || '', tradeAssociation: SPEC_TRADE_MAP[p.category] || '', catalogProductId: p.id });
                        setSpecItemModalTab('product');
                        setShowSpecItemModal(true);
                      };
                      return (
                        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                          <div style={{ display:'flex', gap:'8px', marginBottom:'14px', flexWrap:'wrap', alignItems:'center' }}>
                            <input value={specSearch} onChange={e=>setSpecSearch(e.target.value)} placeholder="Search catalogue…" style={{ padding:'8px 12px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', flex:1, minWidth:'160px' }} />
                            <select value={specCategoryFilter} onChange={e=>setSpecCategoryFilter(e.target.value)} style={{ padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', background:'#fff' }}>
                              <option value="ALL">All categories</option>
                              {SPEC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                            <div style={{ fontSize:'12px', color:'#94a3b8' }}>{catalogProducts.length} product{catalogProducts.length !== 1 ? 's' : ''} in catalogue</div>
                          </div>
                          {catalogProducts.length === 0 && (
                            <div style={{ textAlign:'center', padding:'40px', color:'#94a3b8', border:'1px dashed #e2e8f0', borderRadius:'10px', background:'#fff' }}>
                              <div style={{ fontSize:'13px', fontWeight:'600' }}>Product catalogue is empty</div>
                              <div style={{ fontSize:'11px', marginTop:'3px' }}>Open any spec item and press “Save to catalogue” to build your reusable product library</div>
                            </div>
                          )}
                          {visible.map(p => (
                            <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'12px', padding:'9px 12px', border:'1px solid #e2e8f0', borderRadius:'8px', marginBottom:'6px', background:'#fff' }}>
                              {imgBox(p)}
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ fontSize:'13px', fontWeight:'600', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name || '—'}</div>
                                <div style={{ fontSize:'11px', color:'#64748b', marginTop:'1px' }}>{[p.category, p.supplier, p.brand, p.sku && `SKU: ${p.sku}`].filter(Boolean).join(' · ')}</div>
                              </div>
                              <div style={{ textAlign:'right', minWidth:'70px', fontSize:'13px', fontWeight:'600', color:'#1e293b' }}>{p.unitPrice ? fmt(p.unitPrice) : '—'}{p.unit && p.unitPrice ? <span style={{ fontSize:'10px', color:'#94a3b8' }}> /{p.unit}</span> : null}</div>
                              {p.productUrl && <a href={p.productUrl} target="_blank" rel="noreferrer" style={{ fontSize:'11px', color:'#0284c7', textDecoration:'none', whiteSpace:'nowrap' }}>view ↗</a>}
                              <button onClick={()=>useProduct(p)} style={{ padding:'6px 12px', background:'#b45309', color:'#fff', border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'600', cursor:'pointer', whiteSpace:'nowrap' }}>Use →</button>
                              <button onClick={()=>{ if (window.confirm('Remove this product from the catalogue?')) setCatalogProducts(prev=>prev.filter(x=>x.id!==p.id)); }} style={{ background:'none', border:'none', cursor:'pointer', padding:'4px', color:'#94a3b8', borderRadius:'4px' }}><Trash2 size={13} /></button>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    {/* ---- TEMPLATES ---- */}
                    {specSubTab==='templates' && (
                      <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                        <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:'12px' }}>
                          <button onClick={()=>{ setEditingTemplateId(null); setTemplateForm({...EMPTY_SPEC_TEMPLATE}); setTemplateEditTab('info'); setShowTemplateModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary }}><Plus size={13} style={{marginRight:'4px'}} />New template</button>
                        </div>
                        {specTemplates.length===0 && <div style={{ color:'#94a3b8', fontSize:'14px' }}>No custom templates yet. Create one to reuse across properties.</div>}
                        <div style={{ display:'grid', gridTemplateColumns:isMobile?'1fr':'repeat(3,1fr)', gap:'10px' }}>
                          {specTemplates.map(t=>(
                            <div key={t.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'14px' }}>
                              <span style={{ fontSize:'10px', padding:'2px 7px', borderRadius:'10px', background:'#fef3c7', color:'#92400e', fontWeight:'600' }}>{t.category||'Custom'}</span>
                              <div style={{ fontSize:'14px', fontWeight:'600', color:'#1e293b', margin:'8px 0 2px' }}>{t.name}</div>
                              {t.description && <div style={{ fontSize:'12px', color:'#64748b', marginBottom:'6px' }}>{t.description}</div>}
                              <div style={{ fontSize:'12px', color:'#94a3b8', marginBottom:'10px' }}>{(t.items||[]).length} items</div>
                              {/* Preview first 3 items with images */}
                              {(t.items||[]).slice(0,3).map((item,idx)=>(
                                <div key={idx} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'5px 0', borderBottom:'1px solid #f8fafc' }}>
                                  {imgBox(item, 32)}
                                  <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:'11px', fontWeight:'600', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.name||'Unnamed item'}</div>
                                    <div style={{ fontSize:'10px', color:'#94a3b8' }}>{item.supplier} {item.unitPrice?`· ${fmt(parseFloat(item.unitPrice))}`:''}</div>
                                  </div>
                                </div>
                              ))}
                              <div style={{ display:'flex', gap:'6px', marginTop:'10px' }}>
                                <button onClick={()=>{ setApplyTemplateSel(t.id); setShowApplyTemplateModal(true); }} style={{ ...sBtn(''), ...sBtnPrimary, flex:1, fontSize:'12px' }}>Apply to room</button>
                                <button onClick={()=>{ setEditingTemplateId(t.id); setTemplateForm({...EMPTY_SPEC_TEMPLATE,...t}); setTemplateEditTab('info'); setShowTemplateModal(true); }} style={{ ...sBtn(''), fontSize:'12px' }}>Edit</button>
                                <button onClick={()=>setSpecTemplates(p=>p.filter(x=>x.id!==t.id))} style={{ ...sBtn(''), fontSize:'12px', color:'#ef4444', borderColor:'#fca5a5' }}>Delete</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ---- ALLOWANCES ---- */}
                    {specSubTab==='allowances' && (() => {
                      const allPropIds2 = [...new Set(specItems.map(i=>i.propertyId).filter(Boolean))];
                      const usedCats = [...new Set(specItems.map(i=>i.category).filter(Boolean))];
                      const selPropId = specViewPropId || (allPropIds2[0]||'');
                      return (
                        <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
                            <select value={selPropId} onChange={e=>setSpecViewPropId(e.target.value)} style={{ fontSize:'13px', border:'1px solid #e2e8f0', borderRadius:'7px', padding:'6px 10px', background:'#fff' }}>
                              <option value="">— Select property —</option>
                              {properties.map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                            </select>
                          </div>
                          {!selPropId ? <div style={{ color:'#94a3b8' }}>Select a property to manage allowances.</div> : (
                            <div style={{ background:'#fff', borderRadius:'10px', border:'1px solid #e2e8f0', overflow:'hidden' }}>
                              <div style={{ overflowX: 'auto' }} className="crm-table-wrap">
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px', minWidth: '520px' }}>
                                <thead><tr style={{ background:'#f8fafc' }}>
                                  {['Category','Allowance (£)','Selected total','Variance','Status'].map(h=><th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:'11px', fontWeight:'600', color:'#64748b', borderBottom:'1px solid #e2e8f0' }}>{h}</th>)}
                                </tr></thead>
                                <tbody>
                                  {usedCats.map(cat=>{
                                    const allow = getAllowance(selPropId, cat);
                                    const actual = getCatTotal(selPropId, cat);
                                    const variance = actual - allow;
                                    const over = allow>0 && actual>allow;
                                    const near = allow>0 && !over && actual/allow>=0.85;
                                    const statusColor = over?'#b45309':near?'#ca8a04':'#166534';
                                    const statusLabel = over?'Over budget':near?'Near limit':'Within budget';
                                    return (
                                      <tr key={cat} style={{ borderBottom:'1px solid #f1f5f9' }}>
                                        <td style={{ padding:'9px 12px', fontWeight:'500', color:'#1e293b' }}>{cat}</td>
                                        <td style={{ padding:'9px 12px' }}>
                                          <input type="number" value={allow||''} onChange={e=>{ const v=e.target.value; setSpecAllowances(prev=>{ const idx=prev.findIndex(a=>a.propertyId===selPropId&&a.category===cat); const entry={id:Date.now(),propertyId:selPropId,category:cat,allowance:parseFloat(v)||0}; return idx>=0?prev.map((a,i)=>i===idx?{...a,...entry}:a):[...prev,entry]; }); }} placeholder="—" style={{ width:'90px', padding:'4px 7px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'13px' }} />
                                        </td>
                                        <td style={{ padding:'9px 12px', color:'#1e293b' }}>{fmt(actual)}</td>
                                        <td style={{ padding:'9px 12px', color: allow>0?(over?'#b45309':'#166534'):'#94a3b8', fontWeight:'600' }}>{allow>0?(over?'+':'')+fmt(Math.abs(variance)):'—'}</td>
                                        <td style={{ padding:'9px 12px' }}>{allow>0?<span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'10px', background:over?'#fef3c7':near?'#fef9c3':'#dcfce7', color:statusColor, fontWeight:'600' }}>{statusLabel}</span>:'—'}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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
                  <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px 28px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '600px' }}>

                    {/* PROFILE */}
                    {settingsSection === 'profile' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                        {/* Profile info */}
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: '600', color: '#0f172a', marginBottom: '16px' }}>Profile</div>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                            <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Full name</label><input type="text" value={settingsProfile.name} onChange={e => setSettingsProfile({ ...settingsProfile, name: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                            <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Email</label><input type="email" value={settingsProfile.email} disabled title="Email is your login and can't be changed here" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }} /></div>
                            <div style={{ gridColumn: '1/-1' }}><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Company</label><input type="text" value={settingsProfile.company} onChange={e => setSettingsProfile({ ...settingsProfile, company: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} /></div>
                          </div>
                          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button onClick={handleSaveSettings} disabled={settingsSaving} style={{ padding: '10px 22px', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: settingsSaving ? 'not-allowed' : 'pointer', opacity: settingsSaving ? 0.7 : 1 }}>{settingsSaving ? 'Saving...' : 'Save changes'}</button>
                            {settingsSaved && <span style={{ fontSize: '12px', color: '#059669', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={14} /> Saved</span>}
                            {settingsSaveError && <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600' }}>{settingsSaveError}</span>}
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
                        <div onClick={onToggle} style={{ padding: isMobile ? '10px 0' : '0', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}>
                          <div style={{ width: '44px', height: '24px', borderRadius: '12px', backgroundColor: on ? '#059669' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: '3px', left: on ? '22px' : '3px', width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                          </div>
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
                          <form onSubmit={handleAddUser} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 2fr 1fr auto', gap: '8px', marginBottom: '20px', alignItems: 'end' }}>
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
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(190px, 1fr))', gap: '12px' }}>
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
                        <div><label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '5px' }}>Google Maps Embed API Key</label><input type="text" value={settingsMapsKey} disabled placeholder="Not set" style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'monospace', boxSizing: 'border-box', backgroundColor: '#f8fafc', color: '#94a3b8', cursor: 'not-allowed' }} /><p style={{ margin: '6px 0 0 0', fontSize: '11px', color: '#94a3b8' }}>Read-only — this is the key currently active on the server. Change it by setting VITE_GOOGLE_MAPS_KEY in your .env file and redeploying.</p></div>
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
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: isMobile ? '20px' : '28px', width: '500px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', boxSizing: 'border-box' }}>
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
                        body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes }),
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
                    body: JSON.stringify({ properties: updatedProperties, companies, contacts, surveyors, watchlist, scrapedAuctions, globalNotes, tasks, refurbQuotes }),
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
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: isMobile ? '20px' : '28px', width: '440px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
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
          <div style={{ backgroundColor: '#fff', borderRadius: '12px', padding: isMobile ? '20px' : '28px', width: '460px', maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', boxSizing: 'border-box' }} onClick={e => e.stopPropagation()}>
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

      {/* ==================== MODAL: ADD / EDIT TRADE QUOTE ==================== */}
      {showQuoteModal && (() => {
        const modalTabs = [
          { k:'details',   label:'Details'   },
          { k:'pricing',   label:'Pricing'   },
          { k:'logistics', label:'Logistics' },
          { k:'rating',    label:'Rating'    },
          { k:'notes',     label:'Notes'     },
        ];
        const tabIdx = modalTabs.findIndex(t => t.k === quoteModalTab);
        const setQF = (field, val) => setQuoteForm(prev => ({ ...prev, [field]: val }));
        const setRating = (field, val) => setQuoteForm(prev => ({ ...prev, rating: { ...prev.rating, [field]: val } }));
        const saveQuote = () => {
          const q = {
            ...quoteForm,
            propertyId: parseInt(quoteForm.propertyId) || null,
            companyId:  parseInt(quoteForm.companyId)  || null,
            contactId:  parseInt(quoteForm.contactId)  || null,
            vatAmount: quoteForm.vatAmount || String(Math.round((parseFloat(quoteForm.totalAmount)||0) * (parseFloat(quoteForm.vatRate||0)/100))),
          };
          if (editingQuoteId) {
            setRefurbQuotes(prev => prev.map(x => x.id === editingQuoteId ? { ...x, ...q } : x));
          } else {
            setRefurbQuotes(prev => [...prev, { ...q, id: Date.now(), createdAt: new Date().toISOString().split('T')[0] }]);
          }
          setShowQuoteModal(false);
          setEditingQuoteId(null);
        };
        const fi = (label, field, type = 'text', placeholder = '') => (
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>{label}</label>
            <input type={type} value={quoteForm[field] ?? ''} onChange={e => setQF(field, e.target.value)} placeholder={placeholder} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
          </div>
        );
        const pmKey = quoteForm.pricingMethod;
        const infoNeeded = TRADE_INFO_NEEDED[quoteForm.tradeCategory] || [];
        const suggestedDeps = TRADE_DEPS[quoteForm.tradeCategory] || [];
        return (
          <div onClick={() => setShowQuoteModal(false)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ backgroundColor:'#fff', borderRadius:'14px', width:'680px', maxWidth:'96vw', maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.22)' }}>
              {/* Header */}
              <div style={{ padding: isMobile ? '14px 16px 12px' : '18px 22px 14px', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div>
                  <div style={{ fontSize:'15px', fontWeight:'700', color:'#0f172a' }}>{editingQuoteId ? 'Edit Quote' : 'Add Trade Quote'}</div>
                  {quoteForm.tradeCategory && <div style={{ fontSize:'12px', color:'#64748b', marginTop:'2px' }}>{quoteForm.tradeCategory}{quoteForm.quoteRef ? ` · ${quoteForm.quoteRef}` : ''}</div>}
                </div>
                <button onClick={() => setShowQuoteModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:'4px', borderRadius:'6px', fontSize:'16px' }}>✕</button>
              </div>
              {/* Modal tab strip */}
              <div style={{ display:'flex', gap:'2px', padding: isMobile ? '10px 12px 0' : '10px 22px 0', borderBottom:'1px solid #f1f5f9', flexShrink:0, overflowX: 'auto' }}>
                {modalTabs.map(t => (
                  <button key={t.k} onClick={() => setQuoteModalTab(t.k)} style={{ padding:'7px 14px', border:'none', borderBottom:`2px solid ${quoteModalTab===t.k?'#b45309':'transparent'}`, background:'none', cursor:'pointer', fontSize:'12px', fontWeight:'600', color:quoteModalTab===t.k?'#b45309':'#64748b', marginBottom:'-1px' }}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Body */}
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '14px 16px' : '20px 22px', display:'flex', flexDirection:'column', gap:'14px' }}>

                {/* ── DETAILS ── */}
                {quoteModalTab === 'details' && <>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    {fi('Quote Reference', 'quoteRef', 'text', 'e.g. SPARK-001')}
                    {fi('Quote Date', 'quoteDate', 'date')}
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Trade Category *</label>
                    <select value={quoteForm.tradeCategory} onChange={e => setQF('tradeCategory', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                      <option value="">— Select trade —</option>
                      {TRADE_CATEGORIES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Property</label>
                    <select value={quoteForm.propertyId} onChange={e => setQF('propertyId', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                      <option value="">— No property —</option>
                      {properties.map(p => <option key={p.id} value={String(p.id)}>{p.dealName || p.address || `Property ${p.id}`}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Company</label>
                      <select value={quoteForm.companyId} onChange={e => setQF('companyId', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                        <option value="">— No company —</option>
                        {companies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Contact</label>
                      <select value={quoteForm.contactId} onChange={e => setQF('contactId', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                        <option value="">— No contact —</option>
                        {contacts.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Status</label>
                      <select value={quoteForm.status} onChange={e => setQF('status', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                        {QUOTE_STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                      </select>
                    </div>
                    {fi('Expiry Date', 'expiryDate', 'date')}
                  </div>
                </>}

                {/* ── PRICING ── */}
                {quoteModalTab === 'pricing' && <>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Pricing Method</label>
                    <select value={quoteForm.pricingMethod} onChange={e => setQF('pricingMethod', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                      <option value="">— Select method —</option>
                      {PRICING_METHODS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>

                  {/* Line items — priced jobs under this trade, not one lump sum */}
                  {(() => {
                    const items = quoteForm.lineItems || [];
                    const lineTotal = (li) => (parseFloat(li.qty) || 1) * (parseFloat(li.unitPrice) || 0);
                    const itemsSum = items.reduce((s, li) => s + lineTotal(li), 0);
                    const setItems = (next) => {
                      const sum = next.reduce((s, li) => s + lineTotal(li), 0);
                      setQuoteForm(prev => ({ ...prev, lineItems: next, totalAmount: next.length ? String(Math.round(sum * 100) / 100) : prev.totalAmount }));
                    };
                    const updateItem = (id, field, val) => setItems(items.map(li => li.id === id ? { ...li, [field]: val } : li));
                    const bookEntries = catalogTrades.filter(e => !quoteForm.tradeCategory || e.trade === quoteForm.tradeCategory);
                    return (
                      <div style={{ padding:'12px', background:'#fffbeb', borderRadius:'8px', border:'1px solid #fde68a' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px', flexWrap:'wrap', gap:'6px' }}>
                          <div style={{ fontSize:'11px', fontWeight:'700', color:'#92400e', textTransform:'uppercase', letterSpacing:'.04em' }}>Line items {items.length > 0 && `· ${items.length}`}</div>
                          <div style={{ display:'flex', gap:'6px' }}>
                            {bookEntries.length > 0 && (
                              <select value="" onChange={e => { const entry = bookEntries.find(b => String(b.id) === e.target.value); if (entry) setItems([...items, { id: Date.now(), description: entry.jobType, qty: '1', unit: entry.unit || 'job', unitPrice: String(entry.typicalPrice || ''), fromCatalogId: entry.id }]); }} style={{ padding:'5px 8px', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'11px', background:'#fff', color:'#92400e', maxWidth:'170px' }}>
                                <option value="">+ From price book…</option>
                                {bookEntries.map(b => <option key={b.id} value={String(b.id)}>{b.jobType} — £{Number(b.typicalPrice || 0).toLocaleString()}</option>)}
                              </select>
                            )}
                            <button type="button" onClick={() => setItems([...items, { id: Date.now(), description: '', qty: '1', unit: 'job', unitPrice: '' }])} style={{ padding:'5px 10px', background:'#b45309', color:'#fff', border:'none', borderRadius:'6px', fontSize:'11px', fontWeight:'600', cursor:'pointer' }}>+ Add line</button>
                          </div>
                        </div>
                        {items.length === 0 && <div style={{ fontSize:'12px', color:'#a16207' }}>No line items — add priced jobs to compare item-level, or just fill the totals below.</div>}
                        {items.map(li => (
                          <div key={li.id} style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '3fr 60px 90px 80px auto auto', gap:'6px', alignItems:'center', marginBottom:'6px' }}>
                            <input value={li.description} onChange={e => updateItem(li.id, 'description', e.target.value)} placeholder="Job / item description" style={{ padding:'7px 9px', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'12px' }} />
                            <input type="number" value={li.qty} onChange={e => updateItem(li.id, 'qty', e.target.value)} placeholder="Qty" title="Quantity" style={{ padding:'7px 6px', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'12px' }} />
                            <input type="number" value={li.unitPrice} onChange={e => updateItem(li.id, 'unitPrice', e.target.value)} placeholder="Unit £" title="Unit price" style={{ padding:'7px 6px', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'12px' }} />
                            <div style={{ fontSize:'12px', fontWeight:'600', color:'#92400e', textAlign:'right' }}>£{lineTotal(li).toLocaleString()}</div>
                            <button type="button" title="Save this price to the price book" onClick={() => { if (addPriceBookSample(quoteForm.tradeCategory, li.description, li.unitPrice, { unit: li.unit, companyId: parseInt(quoteForm.companyId) || null, quoteId: editingQuoteId })) alert(`Saved "${li.description}" @ £${Number(li.unitPrice).toLocaleString()} to the ${quoteForm.tradeCategory} price book.`); else alert('Needs a trade, description and unit price first.'); }} style={{ padding:'5px 7px', background:'#fff', color:'#b45309', border:'1px solid #fde68a', borderRadius:'6px', fontSize:'11px', cursor:'pointer', whiteSpace:'nowrap' }}>→ book</button>
                            <button type="button" onClick={() => setItems(items.filter(x => x.id !== li.id))} style={{ padding:'5px 7px', background:'none', color:'#dc2626', border:'none', fontSize:'12px', cursor:'pointer' }}>✕</button>
                          </div>
                        ))}
                        {items.length > 0 && <div style={{ fontSize:'12px', fontWeight:'700', color:'#92400e', textAlign:'right', marginTop:'4px', borderTop:'1px solid #fde68a', paddingTop:'6px' }}>Items total: £{itemsSum.toLocaleString()} — kept in sync with Total Amount</div>}
                      </div>
                    );
                  })()}

                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:'12px' }}>
                    {fi('Total Amount (£)', 'totalAmount', 'number', '0.00')}
                    {fi('Labour (£)', 'labourAmount', 'number', '0.00')}
                    {fi('Materials (£)', 'materialsAmount', 'number', '0.00')}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>VAT Rate</label>
                      <select value={quoteForm.vatRate} onChange={e => setQF('vatRate', e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', backgroundColor:'#fff', boxSizing:'border-box' }}>
                        <option value="0">0% — not VAT registered</option>
                        <option value="5">5%</option>
                        <option value="20">20% — standard rate</option>
                      </select>
                    </div>
                    {fi('VAT Amount (£)', 'vatAmount', 'number', 'Auto-calculated if blank')}
                  </div>
                  {['day_rate','per_m2','per_room','per_item','per_socket','per_radiator','per_linear_m'].includes(pmKey) && (
                    <div style={{ padding:'12px', background:'#f8fafc', borderRadius:'8px', border:'1px solid #f1f5f9' }}>
                      <div style={{ fontSize:'11px', fontWeight:'700', color:'#64748b', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'.04em' }}>Unit Pricing</div>
                      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                        {pmKey==='day_rate'     && fi('Day Rate (£/day)',       'dayRate',        'number','0.00')}
                        {pmKey==='per_m2'       && fi('Price per m² (£)',       'pricePerM2',     'number','0.00')}
                        {pmKey==='per_room'     && fi('Price per Room (£)',     'pricePerRoom',   'number','0.00')}
                        {pmKey==='per_item'     && fi('Price per Item (£)',     'pricePerItem',   'number','0.00')}
                        {pmKey==='per_socket'   && fi('Price per Socket (£)',   'pricePerSocket', 'number','0.00')}
                        {pmKey==='per_radiator' && fi('Price per Radiator (£)', 'pricePerRadiator','number','0.00')}
                        {pmKey==='per_linear_m' && fi('Price per Linear m (£)', 'pricePerLinearM','number','0.00')}
                      </div>
                    </div>
                  )}
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    {fi('Payment Terms', 'paymentTerms', 'text', 'e.g. 50% deposit, balance on completion')}
                    {fi('Warranty', 'warranty', 'text', 'e.g. 12-month workmanship guarantee')}
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'12px', fontWeight:'600', color:'#475569', cursor:'pointer' }}>
                    <input type="checkbox" checked={!!quoteForm.insuranceChecked} onChange={e => setQF('insuranceChecked', e.target.checked)} />
                    Contractor confirmed to have valid public liability insurance
                  </label>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Certifications (comma-separated)</label>
                    <input type="text" value={(quoteForm.certifications||[]).join(', ')} onChange={e => setQF('certifications', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="e.g. NICEIC, Gas Safe, PCA Member" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
                  </div>
                </>}

                {/* ── LOGISTICS ── */}
                {quoteModalTab === 'logistics' && <>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Scope of Works</label>
                    <textarea value={quoteForm.scopeOfWorks} onChange={e => setQF('scopeOfWorks', e.target.value)} rows={3} placeholder="Describe what is included in this quote…" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'12px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Included</label>
                      <textarea value={quoteForm.included} onChange={e => setQF('included', e.target.value)} rows={2} placeholder="What's explicitly included…" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Excluded</label>
                      <textarea value={quoteForm.excluded} onChange={e => setQF('excluded', e.target.value)} rows={2} placeholder="What's explicitly excluded…" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Info Required from Contractor</label>
                    <textarea value={quoteForm.requiredInfo} onChange={e => setQF('requiredInfo', e.target.value)} rows={2} placeholder="Any outstanding info needed before acceptance…" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:'12px' }}>
                    {fi('Start Availability', 'startAvailability', 'date')}
                    {fi('Lead Time (weeks)', 'leadTimeWeeks', 'number', '0')}
                    {fi('Notice Required (days)', 'noticeDays', 'number', '0')}
                    {fi('Est. Duration (weeks)', 'estimatedDurationWeeks', 'number', '0')}
                    {fi('Crew Size', 'crewSize', 'number', '1')}
                    {fi('Location / Base', 'location', 'text', 'e.g. Sheffield S6')}
                  </div>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'6px' }}>
                      Dependencies — trades that must complete first
                      {suggestedDeps.length > 0 && <span style={{ fontWeight:'400', color:'#94a3b8', marginLeft:'6px' }}>Suggested:</span>}
                    </label>
                    {suggestedDeps.length > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'8px' }}>
                        {suggestedDeps.map(d => {
                          const active = (quoteForm.dependencies||[]).includes(d);
                          return (
                            <button key={d} type="button" onClick={() => { const cur = quoteForm.dependencies||[]; setQF('dependencies', active ? cur.filter(x=>x!==d) : [...cur,d]); }} style={{ padding:'3px 10px', fontSize:'11px', borderRadius:'10px', border:'1px solid', cursor:'pointer', fontWeight:'600', backgroundColor:active?'#b45309':'#fff', borderColor:active?'#b45309':'#cbd5e1', color:active?'#fff':'#475569' }}>
                              {d}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <input type="text" value={(quoteForm.dependencies||[]).join(', ')} onChange={e => setQF('dependencies', e.target.value.split(',').map(s=>s.trim()).filter(Boolean))} placeholder="Type trade names separated by commas" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
                  </div>
                </>}

                {/* ── RATING ── */}
                {quoteModalTab === 'rating' && (() => {
                  const ratingFields = [
                    ['priceLevel',    'Price Level',        '1 = expensive · 5 = great value'],
                    ['reliability',   'Reliability',        'Turns up on time, meets deadlines'],
                    ['quality',       'Quality of Work',    'Finish, attention to detail'],
                    ['quoteSpeed',    'Quote Speed',        'How fast they responded'],
                    ['communication', 'Communication',      'Responsive, clear updates'],
                    ['availability',  'Availability',       'Can book within your timescales'],
                    ['flipExperience','Flip Experience',    'Experience on investment refurbs'],
                    ['overallRating', 'Overall Rating',     'Your headline score'],
                  ];
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                      {ratingFields.map(([key, label, hint]) => (
                        <div key={key}>
                          <div style={{ display:'flex', alignItems:'baseline', gap:'8px', marginBottom:'6px' }}>
                            <span style={{ fontSize:'12px', fontWeight:'600', color:'#0f172a' }}>{label}</span>
                            <span style={{ fontSize:'10px', color:'#94a3b8' }}>{hint}</span>
                          </div>
                          <div style={{ display:'flex', gap:'6px', alignItems:'center' }}>
                            {[1,2,3,4,5].map(n => {
                              const active = (quoteForm.rating?.[key]||0) >= n;
                              return (
                                <button key={n} type="button" onClick={() => setRating(key, n)} style={{ width: isMobile ? '44px' : '36px', height: isMobile ? '44px' : '36px', borderRadius:'8px', border:`1px solid ${active?'#b45309':'#e2e8f0'}`, cursor:'pointer', fontSize:'14px', fontWeight:'700', backgroundColor:active?'#b45309':'#fff', color:active?'#fff':'#94a3b8' }}>
                                  {n}
                                </button>
                              );
                            })}
                            {(quoteForm.rating?.[key]||0) > 0 && <span style={{ fontSize:'11px', color:'#64748b', marginLeft:'4px' }}>({quoteForm.rating[key]}/5)</span>}
                          </div>
                        </div>
                      ))}
                      <div>
                        <div style={{ fontSize:'12px', fontWeight:'600', color:'#0f172a', marginBottom:'8px' }}>Would use again?</div>
                        <div style={{ display:'flex', gap:'8px' }}>
                          {[{ v:true, l:'Yes ✓' },{ v:false, l:'No ✗' }].map(({ v, l }) => {
                            const sel = quoteForm.rating?.wouldUseAgain === v;
                            return (
                              <button key={l} type="button" onClick={() => setRating('wouldUseAgain', v)} style={{ padding:'8px 22px', borderRadius:'8px', border:`1px solid ${sel?(v?'#166534':'#991b1b'):'#e2e8f0'}`, cursor:'pointer', fontSize:'13px', fontWeight:'600', backgroundColor:sel?(v?'#166534':'#991b1b'):'#fff', color:sel?'#fff':'#64748b' }}>
                                {l}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── NOTES ── */}
                {quoteModalTab === 'notes' && <>
                  <div>
                    <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Notes</label>
                    <textarea value={quoteForm.notes} onChange={e => setQF('notes', e.target.value)} rows={4} placeholder="Internal notes, observations, next steps…" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box', resize:'vertical' }} />
                  </div>
                  {infoNeeded.length > 0 && (
                    <div style={{ padding:'14px', background:'#f8fafc', borderRadius:'10px', border:'1px solid #f1f5f9' }}>
                      <div style={{ fontSize:'12px', fontWeight:'700', color:'#0f172a', marginBottom:'10px' }}>Pre-quote checklist for {quoteForm.tradeCategory}</div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'7px' }}>
                        {infoNeeded.map((item, i) => (
                          <label key={i} style={{ display:'flex', alignItems:'flex-start', gap:'8px', fontSize:'12px', color:'#475569', cursor:'pointer' }}>
                            <input type="checkbox" style={{ marginTop:'2px' }} />
                            {item}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>}

              </div>
              {/* Footer */}
              <div style={{ padding: isMobile ? '12px 16px' : '14px 22px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0, flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display:'flex', gap:'8px' }}>
                  {tabIdx > 0 && (
                    <button type="button" onClick={() => setQuoteModalTab(modalTabs[tabIdx-1].k)} style={{ padding:'9px 16px', backgroundColor:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>← Back</button>
                  )}
                  {tabIdx < modalTabs.length - 1 && (
                    <button type="button" onClick={() => setQuoteModalTab(modalTabs[tabIdx+1].k)} style={{ padding:'9px 16px', backgroundColor:'#f8fafc', color:'#0f172a', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', fontWeight:'600', cursor:'pointer' }}>Next →</button>
                  )}
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  <button type="button" onClick={() => setShowQuoteModal(false)} style={{ padding:'9px 18px', backgroundColor:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
                  <button type="button" onClick={saveQuote} disabled={!quoteForm.tradeCategory} style={{ padding:'9px 22px', backgroundColor:quoteForm.tradeCategory?'#b45309':'#cbd5e1', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:quoteForm.tradeCategory?'pointer':'default' }}>
                    {editingQuoteId ? 'Save Changes' : 'Add Quote'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== MODAL: SPEC ITEM ==================== */}
      {showSpecItemModal && (() => {
        const setSIF = (f, v) => setSpecItemForm(p=>({...p,[f]:v}));
        const modalTabs = [{k:'product',label:'Product'},{k:'pricing',label:'Pricing'},{k:'location',label:'Location & status'},{k:'linking',label:'Links & notes'}];
        const fi = (label, field, type='text', placeholder='') => (
          <div>
            <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>{label}</label>
            <input type={type} value={specItemForm[field]??''} onChange={e=>setSIF(field,e.target.value)} placeholder={placeholder} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
          </div>
        );
        const saveSpecItem = () => {
          const item = { ...specItemForm, totalPrice: specItemForm.totalPrice || String(parseFloat(specItemForm.unitPrice||0)*parseFloat(specItemForm.quantity||1)), createdAt: new Date().toISOString().split('T')[0] };
          if (editingSpecItemId) { setSpecItems(p=>p.map(x=>x.id===editingSpecItemId?{...x,...item}:x)); }
          else { setSpecItems(p=>[...p,{...item,id:Date.now()}]); }
          setShowSpecItemModal(false); setEditingSpecItemId(null);
        };
        const fetchUrl = async () => {
          const u = specItemForm.productUrl; if (!u) return;
          setUrlFetchLoading(true); setUrlFetchMsg('');
          const token = localStorage.getItem('crm_session');
          try {
            const r = await fetch('/api/product-url-fetch', { method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}, body:JSON.stringify({url:u}) });
            const d = await r.json();
            if (d.success) {
              if (d.name) setSIF('name', d.name);
              if (d.price) setSIF('unitPrice', d.price);
              if (d.imageUrl) setSIF('imageUrl', d.imageUrl);
              if (d.sku) setSIF('sku', d.sku);
              if (d.brand) setSIF('brand', d.brand);
              if (d.description) setSIF('description', d.description);
              if (d.supplier) setSIF('supplier', d.supplier);
              if (d.availability) setSIF('availability', d.availability);
              setUrlFetchMsg('Product data fetched — check and confirm the fields below.');
            } else { setUrlFetchMsg('Could not fetch product data automatically. Fill in fields manually.'); }
          } catch { setUrlFetchMsg('Fetch failed. Fill in fields manually.'); }
          setUrlFetchLoading(false);
        };
        const linkedPropQuotes = specItemForm.propertyId ? refurbQuotes.filter(q=>String(q.propertyId)===specItemForm.propertyId) : [];
        return (
          <div onClick={()=>setShowSpecItemModal(false)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', width:'560px', maxWidth:'96vw', maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
                <span style={{ fontSize:'15px', fontWeight:'700', color:'#1e293b' }}>{editingSpecItemId?'Edit item':'Add spec item'}</span>
                <button onClick={()=>setShowSpecItemModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', padding:'4px' }}><X size={18} /></button>
              </div>
              {/* Tabs */}
              <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', padding: isMobile ? '0 16px' : '0 20px', flexShrink:0, overflowX: 'auto' }}>
                {modalTabs.map(t=><button key={t.k} onClick={()=>setSpecItemModalTab(t.k)} style={{ padding:'9px 14px', fontSize:'12px', border:'none', background:'none', cursor:'pointer', borderBottom:`2px solid ${specItemModalTab===t.k?'#b45309':'transparent'}`, color:specItemModalTab===t.k?'#92400e':'#64748b', fontWeight:'500', whiteSpace: 'nowrap' }}>{t.label}</button>)}
              </div>
              {/* Body */}
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '14px' : '20px' }}>
                {specItemModalTab==='product' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    {/* URL fetch bar */}
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Product URL (optional — we'll try to auto-fill)</label>
                      <div style={{ display:'flex', gap:'6px' }}>
                        <input type="url" value={specItemForm.productUrl??''} onChange={e=>setSIF('productUrl',e.target.value)} placeholder="https://www.screwfix.com/p/…" style={{ flex:1, padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
                        <button onClick={fetchUrl} disabled={urlFetchLoading||!specItemForm.productUrl} style={{ padding:'9px 14px', background:'#b45309', color:'#fff', border:'none', borderRadius:'7px', fontSize:'12px', fontWeight:'600', cursor: (urlFetchLoading||!specItemForm.productUrl)?'default':'pointer', opacity:(urlFetchLoading||!specItemForm.productUrl)?0.6:1 }}>{urlFetchLoading?'Fetching…':'Fetch'}</button>
                      </div>
                      {urlFetchMsg && <div style={{ fontSize:'12px', color:'#b45309', marginTop:'5px' }}>{urlFetchMsg}</div>}
                    </div>
                    {/* Image preview */}
                    {specItemForm.imageUrl && (
                      <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                        <img src={specItemForm.imageUrl} alt="" width={64} height={64} loading="lazy" style={{ width:'64px', height:'64px', objectFit:'cover', borderRadius:'8px', border:'1px solid #e2e8f0' }} onError={e=>{e.target.style.display='none';}} />
                        <div style={{ flex:1 }}>{fi('Image URL','imageUrl','url','')}</div>
                      </div>
                    )}
                    {!specItemForm.imageUrl && fi('Image URL (paste from product page)','imageUrl','url','https://…')}
                    {fi('Product / item name *','name','text','e.g. Bath 1700mm white acrylic')}
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('Supplier','supplier','text','e.g. Screwfix, B&Q, Wickes')}
                      {fi('Brand','brand','text','e.g. Ideal Standard')}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('SKU / product code','sku','text','')}
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Quality level</label>
                        <select value={specItemForm.qualityLevel??''} onChange={e=>setSIF('qualityLevel',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="">—</option>
                          <option value="budget">Budget</option>
                          <option value="mid-range">Mid-range</option>
                          <option value="premium">Premium</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Description</label>
                      <textarea value={specItemForm.description??''} onChange={e=>setSIF('description',e.target.value)} rows={2} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'12px', boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                  </div>
                )}
                {specItemModalTab==='pricing' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('Quantity','quantity','number','1')}
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Unit</label>
                        <select value={specItemForm.unit??'item'} onChange={e=>setSIF('unit',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          {SPEC_UNIT_TYPES.map(u=><option key={u} value={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('Unit price (£)','unitPrice','number','0.00')}
                      {fi('Total price (£ — auto if blank)','totalPrice','number','')}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>VAT rate</label>
                        <select value={specItemForm.vatRate??'20'} onChange={e=>setSIF('vatRate',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="0">0%</option><option value="5">5%</option><option value="20">20%</option>
                        </select>
                      </div>
                      {fi('Delivery cost (£)','deliveryCost','number','0')}
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('Lead time (weeks)','leadTimeWeeks','number','')}
                      {fi('Availability','availability','text','e.g. In stock')}
                    </div>
                  </div>
                )}
                {specItemModalTab==='location' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Property</label>
                        <select value={specItemForm.propertyId??''} onChange={e=>setSIF('propertyId',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="">— None (template item) —</option>
                          {properties.map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Room</label>
                        <select value={specItemForm.room??''} onChange={e=>setSIF('room',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="">—</option>
                          {STANDARD_ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Category</label>
                        <select value={specItemForm.category??''} onChange={e=>{ const c=e.target.value; setSIF('category',c); if(SPEC_TRADE_MAP[c]&&!specItemForm.tradeAssociation) setSIF('tradeAssociation',SPEC_TRADE_MAP[c]); }} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="">—</option>
                          {SPEC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Trade association</label>
                        <select value={specItemForm.tradeAssociation??''} onChange={e=>setSIF('tradeAssociation',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                          <option value="">—</option>
                          {TRADE_CATEGORIES.map(t=><option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'7px' }}>Purchase status</label>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                        {SPEC_ITEM_STATUSES.map(s=>{ const c=SPEC_STATUS_COLORS[s]; return <button key={s} onClick={()=>setSIF('purchaseStatus',s)} style={{ padding:'4px 12px', fontSize:'12px', borderRadius:'12px', border:`1px solid ${specItemForm.purchaseStatus===s?c.color:'#e2e8f0'}`, background:specItemForm.purchaseStatus===s?c.bg:'#fff', color:specItemForm.purchaseStatus===s?c.color:'#64748b', cursor:'pointer', fontWeight:'500' }}>{s}</button>; })}
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:'10px' }}>
                      {fi('Warranty','warranty','text','e.g. 2 year manufacturer')}
                      {fi('Return / refund status','returnStatus','text','')}
                    </div>
                    <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#475569', cursor:'pointer' }}>
                      <input type="checkbox" checked={!!specItemForm.isRequired} onChange={e=>setSIF('isRequired',e.target.checked)} /> Required item (flag if missing)
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#475569', cursor:'pointer' }}>
                      <input type="checkbox" checked={!!specItemForm.isSelected} onChange={e=>setSIF('isSelected',e.target.checked)} /> Include in totals (selected)
                    </label>
                  </div>
                )}
                {specItemModalTab==='linking' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Link to refurb quote (for Quote Mixer integration)</label>
                      <select value={specItemForm.linkedQuoteId??''} onChange={e=>setSIF('linkedQuoteId',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                        <option value="">— None —</option>
                        {linkedPropQuotes.map(q=>{const co=companies.find(c=>c.id===q.companyId); return <option key={q.id} value={String(q.id)}>{q.tradeCategory} — {co?.name||'Unknown'} {q.quoteRef?`(${q.quoteRef})`:''}</option>;})}
                      </select>
                      {specItemForm.linkedQuoteId && refurbQuotes.find(q=>String(q.id)===specItemForm.linkedQuoteId)?.pricingMethod==='labour_materials' && (
                        <div style={{ fontSize:'12px', color:'#b45309', marginTop:'5px', padding:'6px 10px', background:'#fef3c7', borderRadius:'6px' }}>⚠ This quote includes materials in its price. Linking spec items to it may cause double-counting in the Mixer.</div>
                      )}
                    </div>
                    {fi('Comparison group ID (link competing options)','comparisonGroupId','text','e.g. bathroom-wc or leave blank')}
                    <label style={{ display:'flex', alignItems:'center', gap:'8px', fontSize:'13px', color:'#475569', cursor:'pointer' }}>
                      <input type="checkbox" checked={!!specItemForm.isSelected} onChange={e=>setSIF('isSelected',e.target.checked)} /> Selected (chosen option in comparison group)
                    </label>
                    {fi('Selection reason','selectionReason','text','e.g. best value, long warranty')}
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Notes</label>
                      <textarea value={specItemForm.notes??''} onChange={e=>setSIF('notes',e.target.value)} rows={3} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'12px', boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding: isMobile ? '12px 16px' : '14px 20px', borderTop:'1px solid #e2e8f0', flexShrink:0, flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display:'flex', gap:'6px' }}>
                  {modalTabs.map((t,i)=><button key={t.k} onClick={()=>setSpecItemModalTab(t.k)} style={{ width:'8px', height:'8px', borderRadius:'50%', border:'none', cursor:'pointer', background:specItemModalTab===t.k?'#b45309':'#e2e8f0', padding: isMobile ? '18px' : 0, backgroundClip: 'content-box' }} />)}
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  <button onClick={()=>{ if (!specItemForm.name) return; const norm = s => (s||'').trim().toLowerCase(); const exists = catalogProducts.some(p => norm(p.name) === norm(specItemForm.name) && norm(p.supplier) === norm(specItemForm.supplier)); if (exists) { alert('This product is already in the catalogue.'); return; } setCatalogProducts(prev => [...prev, { id: Date.now(), name: specItemForm.name, category: specItemForm.category, supplier: specItemForm.supplier, sku: specItemForm.sku, brand: specItemForm.brand, productUrl: specItemForm.productUrl, imageUrl: specItemForm.imageUrl, description: specItemForm.description, unit: specItemForm.unit, unitPrice: specItemForm.unitPrice, createdAt: new Date().toISOString().split('T')[0] }]); alert(`"${specItemForm.name}" saved to the product catalogue.`); }} disabled={!specItemForm.name} style={{ padding:'9px 14px', background:'#fff', color: specItemForm.name ? '#b45309' : '#cbd5e1', border:`1px solid ${specItemForm.name ? '#fde68a' : '#e2e8f0'}`, borderRadius:'8px', fontSize:'12px', fontWeight:'600', cursor: specItemForm.name ? 'pointer' : 'default' }}>Save to catalogue</button>
                  <button onClick={()=>setShowSpecItemModal(false)} style={{ padding:'9px 18px', background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
                  <button onClick={saveSpecItem} disabled={!specItemForm.name} style={{ padding:'9px 22px', background:specItemForm.name?'#b45309':'#cbd5e1', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:specItemForm.name?'pointer':'default' }}>{editingSpecItemId?'Save changes':'Add item'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== MODAL: SPEC TEMPLATE ==================== */}
      {showTemplateModal && (() => {
        const setTF = (f,v) => setTemplateForm(p=>({...p,[f]:v}));
        const saveTemplate = () => {
          const t = { ...templateForm, createdAt: templateForm.createdAt||new Date().toISOString().split('T')[0] };
          if (editingTemplateId) { setSpecTemplates(p=>p.map(x=>x.id===editingTemplateId?{...x,...t}:x)); }
          else { setSpecTemplates(p=>[...p,{...t,id:Date.now()}]); }
          setShowTemplateModal(false); setEditingTemplateId(null);
        };
        const tItems = templateForm.items||[];
        const addTItem = () => setTF('items',[...tItems,{...EMPTY_SPEC_ITEM,id:Date.now()}]);
        const setTItem = (idx,f,v) => setTF('items',tItems.map((x,i)=>i===idx?{...x,[f]:v}:x));
        const removeTItem = (idx) => setTF('items',tItems.filter((_,i)=>i!==idx));
        return (
          <div onClick={()=>setShowTemplateModal(false)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', width:'600px', maxWidth:'96vw', maxHeight:'88vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
                <span style={{ fontSize:'15px', fontWeight:'700', color:'#1e293b' }}>{editingTemplateId?'Edit template':'New template'}</span>
                <button onClick={()=>setShowTemplateModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
              </div>
              <div style={{ display:'flex', borderBottom:'1px solid #e2e8f0', padding: isMobile ? '0 16px' : '0 20px', flexShrink:0, overflowX: 'auto' }}>
                {[{k:'info',label:'Info'},{k:'items',label:`Items (${tItems.length})`}].map(t=><button key={t.k} onClick={()=>setTemplateEditTab(t.k)} style={{ padding:'9px 14px', fontSize:'12px', border:'none', background:'none', cursor:'pointer', borderBottom:`2px solid ${templateEditTab===t.k?'#b45309':'transparent'}`, color:templateEditTab===t.k?'#92400e':'#64748b', fontWeight:'500', whiteSpace: 'nowrap' }}>{t.label}</button>)}
              </div>
              <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '14px' : '20px' }}>
                {templateEditTab==='info' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:'14px' }}>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Template name *</label>
                      <input type="text" value={templateForm.name??''} onChange={e=>setTF('name',e.target.value)} placeholder="e.g. Basic bathroom spec" style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px', boxSizing:'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Category</label>
                      <select value={templateForm.category??''} onChange={e=>setTF('category',e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                        <option value="">—</option>
                        {SPEC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Description</label>
                      <textarea value={templateForm.description??''} onChange={e=>setTF('description',e.target.value)} rows={2} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'12px', boxSizing:'border-box', resize:'vertical' }} />
                    </div>
                  </div>
                )}
                {templateEditTab==='items' && (
                  <div>
                    {tItems.length===0 && <div style={{ color:'#94a3b8', fontSize:'13px', marginBottom:'12px' }}>No items yet. Add items to this template.</div>}
                    {tItems.map((item,idx)=>(
                      <div key={item.id||idx} style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'12px', marginBottom:'8px', background:'#f8fafc' }}>
                        <div style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                          {/* Image preview in template item */}
                          <div style={{ width:'48px', height:'48px', minWidth:'48px', borderRadius:'7px', border:'1px solid #e2e8f0', overflow:'hidden', background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            {item.imageUrl ? <img src={item.imageUrl} alt="" width={48} height={48} loading="lazy" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e=>{e.target.style.display='none';}} /> : <FileText size={16} color="#cbd5e1" />}
                          </div>
                          <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'6px' }}>
                            <input type="text" value={item.name??''} onChange={e=>setTItem(idx,'name',e.target.value)} placeholder="Item name *" style={{ width:'100%', padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', boxSizing:'border-box' }} />
                            <input type="url" value={item.imageUrl??''} onChange={e=>setTItem(idx,'imageUrl',e.target.value)} placeholder="Image URL (optional)" style={{ width:'100%', padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px', boxSizing:'border-box' }} />
                          </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap:'6px' }}>
                          <input type="text" value={item.supplier??''} onChange={e=>setTItem(idx,'supplier',e.target.value)} placeholder="Supplier" style={{ padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px' }} />
                          <input type="number" value={item.unitPrice??''} onChange={e=>setTItem(idx,'unitPrice',e.target.value)} placeholder="Unit price (£)" style={{ padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px' }} />
                          <select value={item.unit??'item'} onChange={e=>setTItem(idx,'unit',e.target.value)} style={{ padding:'7px 9px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'12px' }}>
                            {SPEC_UNIT_TYPES.map(u=><option key={u} value={u}>{u}</option>)}
                          </select>
                        </div>
                        <button onClick={()=>removeTItem(idx)} style={{ marginTop:'6px', background:'none', border:'none', cursor:'pointer', fontSize:'12px', color:'#ef4444', padding:'2px 0' }}>Remove</button>
                      </div>
                    ))}
                    <button onClick={addTItem} style={{ padding:'8px 16px', fontSize:'12px', border:'1px dashed #b45309', borderRadius:'8px', background:'#fff', color:'#b45309', cursor:'pointer', width:'100%' }}>+ Add item to template</button>
                  </div>
                )}
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', padding: isMobile ? '12px 16px' : '14px 20px', borderTop:'1px solid #e2e8f0', flexShrink:0 }}>
                <button onClick={()=>setShowTemplateModal(false)} style={{ padding:'9px 18px', background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
                <button onClick={saveTemplate} disabled={!templateForm.name} style={{ padding:'9px 22px', background:templateForm.name?'#b45309':'#cbd5e1', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:templateForm.name?'pointer':'default' }}>{editingTemplateId?'Save changes':'Create template'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== MODAL: APPLY TEMPLATE ==================== */}
      {showApplyTemplateModal && (() => {
        const builtInTemplateItems = {
          't-bth-basic': [
            {name:'WC pan + close-couple cistern',supplier:'Screwfix',unitPrice:'120',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Basin + full pedestal',supplier:'B&Q',unitPrice:'75',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Bath 1700mm white acrylic',supplier:'B&Q',unitPrice:'180',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Bath/basin mixer taps',supplier:'Screwfix',unitPrice:'65',quantity:'2',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Shower over bath + screen',supplier:'Screwfix',unitPrice:'120',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Extractor fan 100mm',supplier:'Screwfix',unitPrice:'45',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Mirror cabinet',supplier:'B&Q',unitPrice:'90',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Heated towel rail',supplier:'Screwfix',unitPrice:'60',quantity:'1',unit:'item',category:'Radiators',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Floor tiles',supplier:'Topps Tiles',unitPrice:'25',quantity:'4',unit:'m²',category:'Tiles',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Wall tiles',supplier:'Topps Tiles',unitPrice:'18',quantity:'12',unit:'m²',category:'Tiles',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Accessories set (hooks, roll holder)',supplier:'Screwfix',unitPrice:'35',quantity:'1',unit:'set',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
          't-bth-mid': [
            {name:'WC pan + wall-hung cistern — Ideal Standard',supplier:'Plumbworld',unitPrice:'280',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Semi-recessed basin — Duravit',supplier:'Victoria Plum',unitPrice:'195',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'P-shaped shower bath 1700mm',supplier:'Victoria Plum',unitPrice:'320',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Chrome thermostatic shower — Grohe',supplier:'Plumbworld',unitPrice:'245',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Vanity unit + basin — Tavistock',supplier:'Victoria Plum',unitPrice:'380',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Extractor fan with timer',supplier:'Screwfix',unitPrice:'65',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'LED mirror 600mm with demister',supplier:'Victoria Plum',unitPrice:'180',quantity:'1',unit:'item',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Heated towel rail — chrome 800×500',supplier:'Plumbworld',unitPrice:'120',quantity:'1',unit:'item',category:'Radiators',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Porcelain floor tiles 600×600',supplier:'Topps Tiles',unitPrice:'48',quantity:'4',unit:'m²',category:'Tiles',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Porcelain wall tiles 300×600',supplier:'Topps Tiles',unitPrice:'32',quantity:'12',unit:'m²',category:'Tiles',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Accessories set — chrome finish',supplier:'Screwfix',unitPrice:'85',quantity:'1',unit:'set',category:'Bathroom',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
          't-kitch': [
            {name:'Kitchen carcasses — Enna range',supplier:'Howdens',unitPrice:'1200',quantity:'1',unit:'set',category:'Kitchen',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Laminate worktop — per linear m',supplier:'Howdens',unitPrice:'65',quantity:'4',unit:'linear m',category:'Kitchen',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'1.5 bowl sink + mixer tap',supplier:'Screwfix',unitPrice:'145',quantity:'1',unit:'item',category:'Kitchen',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Extractor hood 600mm',supplier:'Screwfix',unitPrice:'85',quantity:'1',unit:'item',category:'Kitchen',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Splashback tiles',supplier:'Topps Tiles',unitPrice:'22',quantity:'2',unit:'m²',category:'Tiles',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Integrated washer dryer',supplier:'B&Q',unitPrice:'349',quantity:'1',unit:'item',category:'Appliances',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
          't-floor': [
            {name:'LVT click plank — Light Oak',supplier:'Wickes',unitPrice:'18',quantity:'1',unit:'m²',category:'Flooring',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Carpet 80% wool twist',supplier:'Carpetright',unitPrice:'22',quantity:'1',unit:'m²',category:'Carpet',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Carpet underlay 9mm',supplier:'Carpetright',unitPrice:'6',quantity:'1',unit:'m²',category:'Carpet',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Threshold bar — chrome 90cm',supplier:'Screwfix',unitPrice:'9',quantity:'4',unit:'item',category:'Flooring',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
          't-paint': [
            {name:'Dulux Almond White 10L',supplier:'B&Q',unitPrice:'38',quantity:'4',unit:'item',category:'Paint & Decorating',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Dulux white gloss 2.5L',supplier:'B&Q',unitPrice:'18',quantity:'4',unit:'item',category:'Paint & Decorating',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Polyfilla ready-mixed 600g',supplier:'Screwfix',unitPrice:'7',quantity:'6',unit:'item',category:'Paint & Decorating',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Roller + tray set',supplier:'Screwfix',unitPrice:'8',quantity:'4',unit:'set',category:'Paint & Decorating',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Masking tape 50mm',supplier:'Screwfix',unitPrice:'3',quantity:'10',unit:'roll',category:'Paint & Decorating',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
          't-elec': [
            {name:'Flat plate double socket — white',supplier:'Screwfix',unitPrice:'5',quantity:'12',unit:'item',category:'Sockets & Switches',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'1-gang light switch — white',supplier:'Screwfix',unitPrice:'3',quantity:'8',unit:'item',category:'Sockets & Switches',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'LED ceiling light — 12W 4000K',supplier:'Screwfix',unitPrice:'12',quantity:'6',unit:'item',category:'Lighting',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Spot light fitting — brushed chrome',supplier:'Screwfix',unitPrice:'8',quantity:'12',unit:'item',category:'Lighting',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Smoke alarm — optical 230V',supplier:'Screwfix',unitPrice:'22',quantity:'3',unit:'item',category:'Electrical Materials',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Carbon monoxide detector',supplier:'Screwfix',unitPrice:'18',quantity:'1',unit:'item',category:'Electrical Materials',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'LED GU10 bulbs 5W (pack of 10)',supplier:'Screwfix',unitPrice:'12',quantity:'3',unit:'pack',category:'Lighting',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
            {name:'Shaver socket — chrome',supplier:'Screwfix',unitPrice:'15',quantity:'1',unit:'item',category:'Sockets & Switches',purchaseStatus:'needed',isSelected:true,vatRate:'20'},
          ],
        };
        const applyTemplate = () => {
          const propId = applyTemplatePropId;
          const room = applyTemplateRoom;
          if (!propId || !room) return;
          let tItems = [];
          if (builtInTemplateItems[applyTemplateSel]) {
            tItems = builtInTemplateItems[applyTemplateSel];
          } else {
            const tmpl = specTemplates.find(t=>String(t.id)===applyTemplateSel);
            if (tmpl) tItems = tmpl.items||[];
          }
          const newItems = tItems.map(item=>({ ...EMPTY_SPEC_ITEM, ...item, id:Date.now()+Math.random(), propertyId:propId, room, createdAt:new Date().toISOString().split('T')[0] }));
          setSpecItems(p=>[...p,...newItems]);
          setShowApplyTemplateModal(false); setApplyTemplateSel(''); setApplyTemplatePropId(''); setApplyTemplateRoom('');
          setSpecSubTab('property'); setSpecViewPropId(propId); setSpecViewRoom(room);
        };
        const allTemplates = [
          {id:'t-bth-basic',name:'Basic bathroom spec',category:'Bathroom'},
          {id:'t-bth-mid',name:'Mid-range bathroom',category:'Bathroom'},
          {id:'t-kitch',name:'Basic kitchen spec',category:'Kitchen'},
          {id:'t-floor',name:'Standard flooring spec',category:'Flooring'},
          {id:'t-paint',name:'Paint & decorating',category:'Paint & Decorating'},
          {id:'t-elec',name:'Sockets & lighting',category:'Electrical Materials'},
          ...specTemplates.map(t=>({id:String(t.id),name:t.name,category:t.category||'Custom'})),
        ];
        return (
          <div onClick={()=>setShowApplyTemplateModal(false)} style={{ position:'fixed', inset:0, backgroundColor:'rgba(0,0,0,0.45)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:'14px', width:'420px', maxWidth:'96vw', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:'15px', fontWeight:'700', color:'#1e293b' }}>Apply template to room</span>
                <button onClick={()=>setShowApplyTemplateModal(false)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8' }}><X size={18} /></button>
              </div>
              <div style={{ padding: isMobile ? '14px' : '20px', display:'flex', flexDirection:'column', gap:'14px' }}>
                <div>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Template</label>
                  <select value={applyTemplateSel} onChange={e=>setApplyTemplateSel(e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                    <option value="">— Select template —</option>
                    {allTemplates.map(t=><option key={t.id} value={t.id}>{t.name} ({t.category})</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Property *</label>
                  <select value={applyTemplatePropId} onChange={e=>setApplyTemplatePropId(e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                    <option value="">— Select property —</option>
                    {properties.map(p=><option key={p.id} value={String(p.id)}>{p.dealName||p.address}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#64748b', marginBottom:'5px' }}>Room *</label>
                  <select value={applyTemplateRoom} onChange={e=>setApplyTemplateRoom(e.target.value)} style={{ width:'100%', padding:'9px 10px', border:'1px solid #e2e8f0', borderRadius:'7px', fontSize:'13px' }}>
                    <option value="">— Select room —</option>
                    {STANDARD_ROOMS.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:'10px', padding: isMobile ? '12px 16px' : '14px 20px', borderTop:'1px solid #e2e8f0' }}>
                <button onClick={()=>setShowApplyTemplateModal(false)} style={{ padding:'9px 18px', background:'#fff', color:'#475569', border:'1px solid #e2e8f0', borderRadius:'8px', fontSize:'13px', cursor:'pointer' }}>Cancel</button>
                <button onClick={applyTemplate} disabled={!applyTemplateSel||!applyTemplatePropId||!applyTemplateRoom} style={{ padding:'9px 22px', background:(applyTemplateSel&&applyTemplatePropId&&applyTemplateRoom)?'#b45309':'#cbd5e1', color:'#fff', border:'none', borderRadius:'8px', fontSize:'13px', fontWeight:'700', cursor:(applyTemplateSel&&applyTemplatePropId&&applyTemplateRoom)?'pointer':'default' }}>Apply template</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== TASK DRAWER ==================== */}
      {showTaskDrawer && drawerTaskId && (() => {
        const task = tasks.find(t => t.id === drawerTaskId);
        if (!task) { setShowTaskDrawer(false); return null; }
        const ns = task.status === 'open' ? 'not_started' : (task.status || 'not_started');
        const subtasks = task.subtasks || [];
        const comments = task.comments || [];
        const activityLog = task.activityLog || [];
        const doneSubtasks = subtasks.filter(s => s.done).length;
        const assigneeOptions = crmUsers.length > 0 ? crmUsers.map(u => u.name).filter(Boolean) : [user.name || 'Ashley'];
        const drawerUpdate = (changes) => {
          const logEntry = { id: Date.now() + Math.random(), type: 'updated', detail: Object.keys(changes).join(', ') + ' updated', user: user.name || 'You', at: new Date().toISOString() };
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...changes, activityLog: [...(t.activityLog || []), logEntry], updatedAt: new Date().toISOString() } : t));
        };
        const lo = task.linkedType === 'Property' ? properties : task.linkedType === 'Company' ? companies : task.linkedType === 'Contact' ? contacts : [];
        const inp = { padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', width: '100%', background: '#fff', boxSizing: 'border-box' };
        const lbl = { fontSize: '10px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '5px' };
        const fld = { marginBottom: '14px' };
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) setShowTaskDrawer(false); }}>
            <div style={{ width: isMobile ? '100%' : '520px', background: '#fff', borderLeft: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,.08)', height: '100%', overflowY: 'auto' }}>
              {/* Drawer header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: isMobile ? '14px 16px' : '16px 20px', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <input value={task.title} onChange={e => drawerUpdate({ title: e.target.value })} style={{ flex: 1, fontWeight: '600', fontSize: '15px', border: 'none', outline: 'none', color: '#0f172a', padding: 0 }} />
                <button onClick={() => setShowTaskDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={18} /></button>
              </div>
              <div style={{ padding: isMobile ? '14px 16px' : '18px 20px', flex: 1 }}>
                {/* Status + Priority row */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={lbl}>Status</div>
                    <select value={ns} onChange={e => drawerUpdate({ status: e.target.value })} style={{ ...inp }}>
                      {TASK_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={lbl}>Priority</div>
                    <select value={task.priority || 'Medium'} onChange={e => drawerUpdate({ priority: e.target.value })} style={{ ...inp }}>
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                </div>
                {/* Assignee + Due date */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <div style={lbl}>Assignee</div>
                    <select value={task.assignee || ''} onChange={e => drawerUpdate({ assignee: e.target.value })} style={{ ...inp }}>
                      {assigneeOptions.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={lbl}>Due date</div>
                    <input type="date" value={task.dueDate || ''} onChange={e => drawerUpdate({ dueDate: e.target.value })} style={{ ...inp }} />
                  </div>
                </div>
                {/* Waiting on */}
                {(ns === 'waiting' || task.waitingOn) && (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                    <div>
                      <div style={lbl}>Waiting on</div>
                      <select value={task.waitingOn || ''} onChange={e => drawerUpdate({ waitingOn: e.target.value })} style={{ ...inp }}>
                        <option value="">Select…</option>
                        {WAITING_ON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={lbl}>Expected by</div>
                      <input type="date" value={task.expectedResponseDate || ''} onChange={e => drawerUpdate({ expectedResponseDate: e.target.value })} style={{ ...inp }} />
                    </div>
                  </div>
                )}
                {/* Linked record */}
                <div style={fld}>
                  <div style={lbl}>Linked record</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select value={task.linkedType || ''} onChange={e => drawerUpdate({ linkedType: e.target.value, linkedId: null, linkedName: '' })} style={{ ...inp, width: '130px', flex: 'none' }}>
                      <option value="">No link</option>
                      <option value="Property">Property</option>
                      <option value="Company">Company</option>
                      <option value="Contact">Contact</option>
                    </select>
                    {task.linkedType && (
                      <select value={task.linkedId || ''} onChange={e => { const rec = lo.find(x => x.id === parseInt(e.target.value)); drawerUpdate({ linkedId: parseInt(e.target.value) || null, linkedName: rec?.address || rec?.name || '' }); }} style={{ ...inp }}>
                        <option value="">Select…</option>
                        {lo.map(x => <option key={x.id} value={x.id}>{x.address || x.name}</option>)}
                      </select>
                    )}
                  </div>
                </div>
                {/* Notes / Description */}
                <div style={fld}>
                  <div style={lbl}>Notes</div>
                  <textarea value={task.notes || ''} onChange={e => drawerUpdate({ notes: e.target.value })} rows={3} placeholder="Add notes…" style={{ ...inp, resize: 'vertical', fontFamily: 'inherit', lineHeight: '1.5' }} />
                </div>
                {/* Subtasks */}
                <div style={fld}>
                  <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ListChecks size={12} />Subtasks{subtasks.length > 0 ? ` — ${doneSubtasks}/${subtasks.length} done` : ''}
                  </div>
                  {subtasks.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>No subtasks yet</div>}
                  {subtasks.map(st => (
                    <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid #f8fafc' }}>
                      <input type="checkbox" checked={st.done} onChange={() => {
                        const updatedSubs = subtasks.map(s => s.id === st.id ? { ...s, done: !s.done } : s);
                        const allDone = updatedSubs.length > 0 && updatedSubs.every(s => s.done);
                        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks: updatedSubs, ...(allDone && ns !== 'done' ? { status: 'done', completedAt: new Date().toISOString(), completedBy: user.name } : {}) } : t));
                      }} style={{ width: '14px', height: '14px', cursor: 'pointer', accentColor: '#d97706' }} />
                      <span style={{ flex: 1, fontSize: '13px', color: st.done ? '#94a3b8' : '#0f172a', textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</span>
                      <button onClick={() => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks: (t.subtasks || []).filter(s => s.id !== st.id) } : t))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fca5a5', display: 'flex', padding: '2px' }}><X size={12} /></button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                    <input id="drawer-subtask-input" placeholder="Add subtask…" onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now(), title: v, done: false, createdAt: new Date().toISOString() }] } : t)); e.target.value = ''; } } }} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }} />
                    <button onClick={() => { const inp = document.getElementById('drawer-subtask-input'); const v = inp?.value?.trim(); if (v) { setTasks(prev => prev.map(t => t.id === task.id ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now(), title: v, done: false, createdAt: new Date().toISOString() }] } : t)); if (inp) inp.value = ''; } }} style={{ padding: '6px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Add</button>
                  </div>
                </div>
                {/* Comments */}
                <div style={fld}>
                  <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={12} />Comments{comments.length > 0 ? ` (${comments.length})` : ''}
                  </div>
                  {comments.length === 0 && <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>No comments yet</div>}
                  {comments.map(cm => (
                    <div key={cm.id} style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: cm.author === user.name ? '#fef3c7' : '#e1f5ee', color: cm.author === user.name ? '#92400e' : '#0f6e56', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>{(cm.author || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</div>
                      <div style={{ flex: 1, background: '#f8fafc', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '3px' }}><strong>{cm.author}</strong> · {cm.createdAt ? new Date(cm.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</div>
                        <div style={{ fontSize: '13px', color: '#0f172a', lineHeight: '1.5' }}>{cm.body}</div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input id="drawer-comment-input" placeholder={`${user.name || 'You'}: write a comment…`} onKeyDown={e => { if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { const comment = { id: Date.now(), author: user.name || 'You', body: v, createdAt: new Date().toISOString(), edited: false }; setTasks(prev => prev.map(t => t.id === task.id ? { ...t, comments: [...(t.comments || []), comment] } : t)); e.target.value = ''; } } }} style={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: '6px', padding: '7px 10px', fontSize: '13px' }} />
                    <button onClick={() => { const el = document.getElementById('drawer-comment-input'); const v = el?.value?.trim(); if (v) { const comment = { id: Date.now(), author: user.name || 'You', body: v, createdAt: new Date().toISOString(), edited: false }; setTasks(prev => prev.map(t => t.id === task.id ? { ...t, comments: [...(t.comments || []), comment] } : t)); if (el) el.value = ''; } }} style={{ padding: '7px 14px', background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}>Post</button>
                  </div>
                </div>
                {/* Activity log */}
                {activityLog.length > 0 && (
                  <div>
                    <div style={{ ...lbl, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}><Activity size={12} />Activity</div>
                    <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                      {[...activityLog].reverse().map((entry, i) => (
                        <div key={i} style={{ fontSize: '11px', color: '#64748b', padding: '4px 0', borderBottom: '1px solid #f8fafc', display: 'flex', gap: '6px' }}>
                          <span style={{ color: '#94a3b8', flexShrink: 0 }}>{entry.at ? new Date(entry.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                          <span><strong>{entry.user}</strong> — {entry.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Meta */}
                <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '16px', fontSize: '11px', color: '#94a3b8', flexWrap: 'wrap' }}>
                  {task.createdDate && <span>Created {task.createdDate}{task.createdBy ? ` by ${task.createdBy}` : ''}</span>}
                  {task.completedAt && <span>Completed {new Date(task.completedAt).toLocaleDateString('en-GB')}{task.completedBy ? ` by ${task.completedBy}` : ''}</span>}
                </div>
                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                  <button onClick={() => { if (!window.confirm('Delete this task?')) return; setTasks(prev => prev.filter(t => t.id !== task.id)); setShowTaskDrawer(false); }} style={{ padding: '8px 14px', background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>Delete task</button>
                  <button onClick={() => setShowTaskDrawer(false)} style={{ padding: '8px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>Close</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================== TASK: APPLY TEMPLATE MODAL ==================== */}
      {showTaskApplyModal && (() => {
        const allTpls = [...DEFAULT_TASK_TEMPLATES, ...taskTemplates];
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={e => { if (e.target === e.currentTarget) setShowTaskApplyModal(false); }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: isMobile ? '20px' : '28px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,.15)', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontWeight: '600', fontSize: '16px' }}>Apply template to property</div>
                <button onClick={() => setShowTaskApplyModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={18} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '5px' }}>Template</div>
                  <select value={taskApplyTemplateSel} onChange={e => setTaskApplyTemplateSel(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
                    <option value="">Choose a template…</option>
                    {allTpls.map(t => <option key={t.id} value={t.id}>{t.name} ({t.items.length} tasks)</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '5px' }}>Property</div>
                  <select value={taskApplyPropId} onChange={e => setTaskApplyPropId(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', background: '#fff' }}>
                    <option value="">Choose a property…</option>
                    {properties.map(p => <option key={p.id} value={p.id}>{p.dealName || p.address?.split(',')[0] || `Property ${p.id}`}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '5px' }}>Key date (auction / completion / start)</div>
                  <input type="date" value={taskApplyDate} onChange={e => setTaskApplyDate(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '13px', boxSizing: 'border-box' }} />
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>Task due dates are calculated relative to this date. Leave blank to use today.</div>
                </div>
                {taskApplyTemplateSel && taskApplyPropId && (
                  <div style={{ background: '#fef3c7', borderRadius: '8px', padding: '10px 12px', fontSize: '12px', color: '#92400e' }}>
                    This will create {allTpls.find(t => t.id === taskApplyTemplateSel)?.items.length || 0} tasks linked to the selected property.
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '22px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowTaskApplyModal(false)} style={{ padding: '9px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '7px', fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { if (!taskApplyTemplateSel || !taskApplyPropId) return; const allTpl2 = [...DEFAULT_TASK_TEMPLATES, ...taskTemplates]; const tpl = allTpl2.find(t => t.id === taskApplyTemplateSel); const prop = properties.find(p => p.id === parseInt(taskApplyPropId)); const baseDate = taskApplyDate ? new Date(taskApplyDate) : new Date(); const todayS = new Date().toISOString().split('T')[0]; const newTasks = tpl.items.map(item => { const due = new Date(baseDate); due.setDate(due.getDate() + (item.dayOffset || 0)); return { id: Date.now() + Math.random(), title: item.title, dueDate: due.toISOString().split('T')[0], priority: item.priority || 'Medium', status: 'not_started', linkedType: 'Property', linkedId: parseInt(taskApplyPropId), linkedName: prop?.dealName || prop?.address?.split(',')[0] || '', notes: '', assignee: user.name || 'Ashley', createdDate: todayS, createdBy: user.name || 'Ashley', waitingOn: item.waitingOn || '', templateId: tpl.id, subtasks: [], comments: [], reminders: [], activityLog: [{ id: Date.now(), type: 'created', detail: `Created from template: ${tpl.name}`, user: user.name || 'You', at: new Date().toISOString() }] }; }); setTasks(prev => [...prev, ...newTasks]); setShowTaskApplyModal(false); setTaskApplyTemplateSel(''); setTaskApplyPropId(''); setTaskApplyDate(''); }} disabled={!taskApplyTemplateSel || !taskApplyPropId} style={{ padding: '9px 20px', background: taskApplyTemplateSel && taskApplyPropId ? '#d97706' : '#e2e8f0', color: taskApplyTemplateSel && taskApplyPropId ? '#fff' : '#94a3b8', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: taskApplyTemplateSel && taskApplyPropId ? 'pointer' : 'default' }}>Apply template</button>
              </div>
            </div>
          </div>
        );
      })()}

      </main>
    </div>
  );
}