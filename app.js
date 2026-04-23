/* =============================================
   AŞK BİR SİNYAL - Application Logic
   Couple communication app with Supabase backend
   ============================================= */

// ═══════════════════════════════════════
// ─── CONFIGURATION ───
// ═══════════════════════════════════════
const SUPABASE_URL = 'https://bqshcwwagsavpmhifztc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_670xqQml4GvDnEdleJn2AQ_Q78pSOyb';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════
// ─── SIGNAL DEFINITIONS ───
// ═══════════════════════════════════════
const SIGNALS = {
    miss:   { emoji: '❤️',  title: 'Seni Özledim',    sub: 'kalbim seninle' },
    love:   { emoji: '💋',  title: 'Seni Seviyorum',  sub: 'tüm kalbimle' },
    hurt:   { emoji: '😔',  title: 'Kırgınım',        sub: 'konuşmamız lazım' },
    angry:  { emoji: '😡',  title: 'Kızgınım',        sub: 'seninle konuşmam lazım' },
    call:   { emoji: '📞',  title: 'Müsaitsen Ara',   sub: 'sesini duymak istiyorum' },
    sleep:  { emoji: '😴',  title: 'Uyuyorum',         sub: 'iyi geceler sevgilim' },
    urgent: { emoji: '🚨',  title: 'Acil Bana Yaz',   sub: 'lütfen hemen yaz' },
    hug:    { emoji: '🤗',  title: 'Sarıl Bana',      sub: 'sanal bir sarılma' },
    happy:  { emoji: '😊',  title: 'Mutluyum',         sub: 'mutluluğumu paylaşıyorum' },
    meet:   { emoji: '🫂',  title: 'Buluşalım',        sub: 'seni görmek istiyorum' },
};

// ─── Daily Messages ───
const DAILY_MESSAGES = [
    '"Seni düşünmeden geçen bir anım yok."',
    '"Bir dokunuş kadar yakınım sana."',
    '"Sadece seni hissettirmek istedim."',
    '"Sen benim en güzel tesadüfümsün."',
    '"Kalbim seninle atıyor, bunu bil yeter."',
    '"Gözlerini kapatsam bile seni görüyorum."',
    '"Seninle her an bir bayram."',
    '"Uzaklık bir rakam, sevgim sonsuz."',
    '"Her gün seni biraz daha çok seviyorum."',
    '"Sen benim yarım kalan cümlelerimsin."',
    '"Bir mesaj bile senin varlığını hissettirir."',
    '"Dünyada en çok seni seviyorum."',
    '"Seninle geçen her saniye armağan."',
];

// ═══════════════════════════════════════
// ─── APP STATE ───
// ═══════════════════════════════════════
let currentProfile = null;   // My profile from 'profiles' table
let partnerProfile = null;   // Partner's profile
let notifications = [];      // Received signals
let signalChannel = null;    // Realtime subscription
let locationChannel = null;  // Realtime location subscription

let settings = {
    notifications: true,
    vibration: true,
    darkMode: true,
    location: true,
};

// ═══════════════════════════════════════
// ─── INITIALIZATION ───
// ═══════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    loadSettings();
    applyTheme();
    setDailyMessage();
    registerServiceWorker();
    await checkAuth();
});

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
}

// ═══════════════════════════════════════
// ─── AUTHENTICATION ───
// ═══════════════════════════════════════
async function checkAuth() {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (session) {
            await loadProfile(session.user.id);
            if (currentProfile && currentProfile.partner_id) {
                await loadPartner();
                showScreen('screen-main');
                subscribeToSignals();
                subscribeToLocation();
                if (settings.location) startLocationTracking();
            } else if (currentProfile) {
                showScreen('screen-connect');
            } else {
                showScreen('screen-welcome');
            }
        } else {
            showScreen('screen-welcome');
        }
    } catch (e) {
        console.warn('Auth check failed:', e);
        showScreen('screen-welcome');
    }
}

async function loadProfile(userId) {
    const { data, error } = await db
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (data) currentProfile = data;
}

async function loadPartner() {
    if (!currentProfile || !currentProfile.partner_id) return;
    const { data } = await db
        .from('profiles')
        .select('*')
        .eq('id', currentProfile.partner_id)
        .single();
    if (data) partnerProfile = data;
}

async function handleRegister(e) {
    e.preventDefault();

    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim().toLowerCase();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (!name || !email || !password) {
        showToast('Lütfen tüm alanları doldurun ⚠️');
        return;
    }
    if (password.length < 6) {
        showToast('Şifre en az 6 karakter olmalı 🔒');
        return;
    }
    if (password !== confirm) {
        showToast('Şifreler eşleşmiyor ❌');
        return;
    }

    showToast('Hesap oluşturuluyor...');

    // 1. Supabase Auth sign up
    const { data: authData, error: authError } = await db.auth.signUp({
        email,
        password,
    });

    if (authError) {
        showToast(authError.message.includes('already')
            ? 'Bu e-posta zaten kayıtlı 📧'
            : 'Kayıt hatası: ' + authError.message);
        return;
    }

    // 2. Create profile
    const code = generateConnectionCode();
    const { error: profileError } = await db.from('profiles').insert({
        id: authData.user.id,
        name,
        email,
        connection_code: code,
    });

    if (profileError) {
        showToast('Profil oluşturulamadı ❌');
        console.error(profileError);
        return;
    }

    await loadProfile(authData.user.id);

    showToast('Hesabın oluşturuldu! 🎉');
    showScreen('screen-connect');
    e.target.reset();
}

async function handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showToast('Lütfen tüm alanları doldurun ⚠️');
        return;
    }

    showToast('Giriş yapılıyor...');

    const { data, error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        showToast('E-posta veya şifre hatalı ❌');
        return;
    }

    await loadProfile(data.user.id);

    if (!currentProfile) {
        showToast('Profil bulunamadı ❌');
        return;
    }

    if (currentProfile.partner_id) {
        await loadPartner();
        showScreen('screen-main');
        subscribeToSignals();
        subscribeToLocation();
        if (settings.location) startLocationTracking();
    } else {
        showScreen('screen-connect');
    }

    showToast(`Hoş geldin ${currentProfile.name}! 💕`);
    e.target.reset();
}

async function handleLogout() {
    unsubscribeAll();
    stopLocationTracking();
    await db.auth.signOut();
    currentProfile = null;
    partnerProfile = null;
    notifications = [];
    showScreen('screen-welcome');
    showToast('Çıkış yapıldı 👋');
}

// ═══════════════════════════════════════
// ─── SCREEN NAVIGATION ───
// ═══════════════════════════════════════
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
        target.scrollTop = 0;
    }

    if (screenId === 'screen-main') {
        updateMainScreen();
    } else if (screenId === 'screen-notifications') {
        renderNotifications();
    } else if (screenId === 'screen-settings') {
        updateSettingsScreen();
    } else if (screenId === 'screen-connect') {
        displayMyCode();
    } else if (screenId === 'screen-location') {
        initLocationMap();
    }
}

// ═══════════════════════════════════════
// ─── CONNECTION CODE & PAIRING ───
// ═══════════════════════════════════════
function generateConnectionCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function displayMyCode() {
    const codeEl = document.getElementById('my-code');
    if (codeEl && currentProfile) {
        codeEl.textContent = currentProfile.connection_code;
    }
}

function copyCode() {
    if (!currentProfile) return;
    const code = currentProfile.connection_code;

    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('Kod kopyalandı! 📋');
        }).catch(() => fallbackCopy(code));
    } else {
        fallbackCopy(code);
    }
}

function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
        document.execCommand('copy');
        showToast('Kod kopyalandı! 📋');
    } catch {
        showToast('Kodu manuel kopyalayın');
    }
    document.body.removeChild(ta);
}

async function connectPartner() {
    const input = document.getElementById('partner-code-input');
    const code = input.value.trim().toUpperCase();

    if (!code || code.length < 4) {
        showToast('Lütfen geçerli bir kod girin ⚠️');
        return;
    }

    if (currentProfile && code === currentProfile.connection_code) {
        showToast('Kendi kodunuzu giremezsiniz 😅');
        return;
    }

    showToast('Bağlanılıyor...');

    // Call the server-side pairing function
    const { data, error } = await db.rpc('connect_partner', {
        partner_code: code,
    });

    if (error) {
        showToast('Bağlantı hatası ❌');
        console.error(error);
        return;
    }

    if (data && data.error) {
        showToast(data.error + ' ❌');
        return;
    }

    // Reload profiles
    const { data: { session } } = await db.auth.getSession();
    if (session) {
        await loadProfile(session.user.id);
        await loadPartner();
    }

    showToast(`${data.partner_name} ile bağlandınız! 💕`);
    input.value = '';

    subscribeToSignals();
    subscribeToLocation();

    setTimeout(() => showScreen('screen-main'), 800);
}

async function disconnectPartner() {
    if (!currentProfile || !currentProfile.partner_id) return;

    if (confirm('Bağlantıyı kesmek istediğinize emin misiniz?')) {
        const { data, error } = await db.rpc('disconnect_partner');

        if (error || (data && data.error)) {
            showToast('Bağlantı kesilemedi ❌');
            return;
        }

        unsubscribeAll();
        partnerProfile = null;

        const { data: { session } } = await db.auth.getSession();
        if (session) await loadProfile(session.user.id);

        showToast('Bağlantı kesildi 💔');
        showScreen('screen-connect');
    }
}

// ═══════════════════════════════════════
// ─── SIGNAL SENDING ───
// ═══════════════════════════════════════
async function sendSignal(type) {
    if (!partnerProfile) {
        showToast('Önce sevgilinle bağlan! 🔗');
        return;
    }

    const signal = SIGNALS[type];
    if (!signal) return;

    // Button animation
    const btn = document.getElementById(`btn-signal-${type}`);
    if (btn) {
        btn.classList.add('sent');
        setTimeout(() => btn.classList.remove('sent'), 500);
    }

    // Vibrate
    if (settings.vibration && navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
    }

    // Insert signal into Supabase
    const { error } = await db.from('signals').insert({
        sender_id: currentProfile.id,
        receiver_id: partnerProfile.id,
        signal_type: type,
    });

    if (error) {
        showToast('Gönderilemedi ❌');
        console.error(error);
        return;
    }

    showToast(`${signal.emoji} Mesajın gönderildi!`);
}

// ═══════════════════════════════════════
// ─── REALTIME SUBSCRIPTIONS ───
// ═══════════════════════════════════════
function subscribeToSignals() {
    if (!currentProfile) return;
    if (signalChannel) signalChannel.unsubscribe();

    signalChannel = db
        .channel('my-signals')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'signals',
            filter: `receiver_id=eq.${currentProfile.id}`,
        }, (payload) => {
            handleIncomingSignal(payload.new);
        })
        .subscribe();
}

function subscribeToLocation() {
    if (!currentProfile || !currentProfile.partner_id) return;
    if (locationChannel) locationChannel.unsubscribe();

    locationChannel = db
        .channel('partner-location')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'locations',
            filter: `user_id=eq.${currentProfile.partner_id}`,
        }, (payload) => {
            if (payload.new) {
                updateLocationUI('partner', payload.new);
            }
        })
        .subscribe();
}

function unsubscribeAll() {
    if (signalChannel) { signalChannel.unsubscribe(); signalChannel = null; }
    if (locationChannel) { locationChannel.unsubscribe(); locationChannel = null; }
}

function handleIncomingSignal(signalRow) {
    const signalDef = SIGNALS[signalRow.signal_type];
    if (!signalDef) return;

    const notification = {
        ...signalRow,
        emoji: signalDef.emoji,
        title: signalDef.title,
        senderName: partnerProfile ? partnerProfile.name : 'Sevgilin',
    };

    notifications.unshift(notification);

    // Show overlay
    if (settings.notifications) {
        showIncomingSignal(notification);
    }

    // Vibrate
    if (settings.vibration && navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]);
    }

    updateNotifBadge();
}

function showIncomingSignal(notification) {
    const overlay = document.getElementById('incoming-signal-overlay');
    const emoji = document.getElementById('incoming-emoji');
    const sender = document.getElementById('incoming-sender');
    const text = document.getElementById('incoming-text');

    emoji.textContent = notification.emoji;
    sender.textContent = `${notification.senderName} sana:`;
    text.textContent = notification.title;

    overlay.classList.remove('hidden');
}

function dismissIncomingSignal() {
    document.getElementById('incoming-signal-overlay').classList.add('hidden');
}

// ═══════════════════════════════════════
// ─── NOTIFICATIONS SCREEN ───
// ═══════════════════════════════════════
async function renderNotifications() {
    const list = document.getElementById('notif-list');
    const empty = document.getElementById('notif-empty');
    const existingItems = list.querySelectorAll('.notif-item');
    existingItems.forEach(item => item.remove());

    // Fetch recent signals from Supabase
    if (currentProfile) {
        const { data } = await db
            .from('signals')
            .select('*')
            .eq('receiver_id', currentProfile.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (data && data.length > 0) {
            notifications = data.map(s => ({
                ...s,
                emoji: SIGNALS[s.signal_type]?.emoji || '💌',
                title: SIGNALS[s.signal_type]?.title || s.signal_type,
                senderName: partnerProfile?.name || 'Sevgilin',
                timestamp: new Date(s.created_at).getTime(),
            }));
        }
    }

    if (!notifications || notifications.length === 0) {
        if (empty) empty.style.display = 'flex';
        return;
    }

    if (empty) empty.style.display = 'none';

    notifications.forEach((n, i) => {
        const item = document.createElement('div');
        item.className = 'notif-item';
        item.style.animationDelay = `${i * 0.05}s`;

        const time = formatTimestamp(n.timestamp || new Date(n.created_at).getTime());

        item.innerHTML = `
            <span class="notif-item-emoji">${n.emoji}</span>
            <div class="notif-item-content">
                <p class="notif-item-text">${n.senderName} sana: ${n.title} ${n.emoji}</p>
                <p class="notif-item-time">${time}</p>
            </div>
        `;

        list.insertBefore(item, empty);
    });

    updateNotifBadge();
}

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;

    const count = notifications ? notifications.length : 0;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

function formatTimestamp(ts) {
    const now = Date.now();
    const diff = now - ts;

    if (diff < 60000) return 'Az önce';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} saat önce`;

    const d = new Date(ts);
    return d.toLocaleDateString('tr-TR', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

// ═══════════════════════════════════════
// ─── MAIN SCREEN ───
// ═══════════════════════════════════════
function updateMainScreen() {
    if (!currentProfile) return;

    const partnerDisplay = document.getElementById('partner-name-display');
    if (partnerDisplay && partnerProfile) {
        partnerDisplay.textContent = partnerProfile.name;
    }

    const myLocName = document.getElementById('my-location-name');
    if (myLocName) myLocName.textContent = currentProfile.name;
    const partnerLocName = document.getElementById('partner-location-name');
    if (partnerLocName && partnerProfile) partnerLocName.textContent = partnerProfile.name;

    updateNotifBadge();
}

// ═══════════════════════════════════════
// ─── SETTINGS ───
// ═══════════════════════════════════════
function loadSettings() {
    try {
        const saved = localStorage.getItem('ask_settings');
        if (saved) settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {}
}

function saveSettings() {
    localStorage.setItem('ask_settings', JSON.stringify(settings));
}

function updateSettingsScreen() {
    if (!currentProfile) return;

    document.getElementById('settings-name').textContent = currentProfile.name;
    document.getElementById('settings-email').textContent = currentProfile.email;

    if (partnerProfile) {
        document.getElementById('settings-partner').textContent = partnerProfile.name;
        document.getElementById('settings-status').textContent = 'Bağlı ✅';
        document.getElementById('settings-status').classList.add('status-connected');
    } else {
        document.getElementById('settings-partner').textContent = 'Bağlı değil';
        document.getElementById('settings-status').textContent = 'Bağlantı yok';
        document.getElementById('settings-status').classList.remove('status-connected');
    }

    document.getElementById('toggle-notif').checked = settings.notifications;
    document.getElementById('toggle-vibration').checked = settings.vibration;
    document.getElementById('toggle-dark').checked = settings.darkMode;
    const locToggle = document.getElementById('toggle-location');
    if (locToggle) locToggle.checked = settings.location;
}

function toggleSetting(key) {
    settings[key] = !settings[key];
    saveSettings();

    const labels = {
        notifications: settings.notifications ? 'Bildirimler açık 🔔' : 'Bildirimler kapalı 🔕',
        vibration: settings.vibration ? 'Titreşim açık 📳' : 'Titreşim kapalı',
        location: settings.location ? 'Konum paylaşımı açık 📍' : 'Konum paylaşımı kapalı',
    };

    if (key === 'location') {
        if (settings.location) startLocationTracking();
        else stopLocationTracking();
    }

    showToast(labels[key] || 'Ayar güncellendi ✅');
}

// ─── Theme ───
function toggleDarkMode() {
    settings.darkMode = !settings.darkMode;
    saveSettings();
    applyTheme();
    showToast(settings.darkMode ? 'Karanlık mod açık 🌙' : 'Aydınlık mod açık ☀️');
}

function applyTheme() {
    document.body.classList.toggle('light-mode', !settings.darkMode);
}

// ─── Daily Message ───
function setDailyMessage() {
    const el = document.getElementById('daily-text');
    if (!el) return;
    const today = new Date();
    const dayIndex = (today.getFullYear() * 366 + today.getMonth() * 31 + today.getDate()) % DAILY_MESSAGES.length;
    el.textContent = DAILY_MESSAGES[dayIndex];
}

// ─── Toast ───
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ═══════════════════════════════════════
// ─── LOCATION SYSTEM ───
// ═══════════════════════════════════════

let locationMap = null;
let myMarker = null;
let partnerMarker = null;
let locationWatchId = null;

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://carto.com/">CARTO</a>';

function createMarkerIcon(type) {
    return L.divIcon({
        className: '',
        html: `<div class="map-marker ${type}-marker">${type === 'my' ? '💜' : '💖'}</div>`,
        iconSize: [32, 40],
        iconAnchor: [16, 40],
        popupAnchor: [0, -42],
    });
}

// Start GPS tracking
function startLocationTracking() {
    if (!navigator.geolocation) return;
    if (locationWatchId !== null) return;

    locationWatchId = navigator.geolocation.watchPosition(
        async (pos) => {
            if (!currentProfile) return;

            const loc = {
                user_id: currentProfile.id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                updated_at: new Date().toISOString(),
            };

            // Upsert to Supabase
            await db.from('locations').upsert(loc, { onConflict: 'user_id' });
            updateLocationUI('my', loc);
        },
        (err) => console.warn('Location error:', err.message),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
}

function stopLocationTracking() {
    if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
    }
}

// Manual share button
async function shareMyLocation() {
    if (!navigator.geolocation) {
        showToast('Tarayıcı konum desteği yok ⚠️');
        return;
    }

    const btn = document.getElementById('btn-share-location');
    if (btn) btn.textContent = '📍 Konum alınıyor...';

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            if (!currentProfile) return;

            const loc = {
                user_id: currentProfile.id,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
                updated_at: new Date().toISOString(),
            };

            await db.from('locations').upsert(loc, { onConflict: 'user_id' });
            updateLocationUI('my', loc);
            showToast('Konumun paylaşıldı! 📍');

            if (settings.vibration && navigator.vibrate) navigator.vibrate(100);
            if (btn) btn.textContent = '📍 Konumumu Paylaş';
        },
        () => {
            showToast('Konum alınamadı ⚠️');
            if (btn) btn.textContent = '📍 Konumumu Paylaş';
        },
        { enableHighAccuracy: true, timeout: 10000 }
    );
}

// Update location display
function updateLocationUI(who, loc) {
    const addressEl = document.getElementById(who === 'my' ? 'my-location-address' : 'partner-location-address');
    const timeEl = document.getElementById(who === 'my' ? 'my-location-time' : 'partner-location-time');

    if (addressEl) {
        reverseGeocode(loc.lat, loc.lng).then(address => {
            addressEl.textContent = address;
        });
    }

    if (timeEl) {
        const ts = loc.updated_at ? new Date(loc.updated_at).getTime() : Date.now();
        timeEl.textContent = formatTimestamp(ts);
    }

    updateMapMarker(who, loc);
}

// Full location map screen
function initLocationMap() {
    const container = document.getElementById('location-map');
    if (!container) return;

    if (locationMap) {
        locationMap.remove();
        locationMap = null;
        myMarker = null;
        partnerMarker = null;
    }

    try {
        locationMap = L.map(container, { zoomControl: true });
        L.tileLayer(TILE_URL, { attribution: TILE_ATTR }).addTo(locationMap);
    } catch (e) { return; }

    const bounds = [];

    // Load my location
    loadAndShowLocation('my', bounds);
    // Load partner location
    loadAndShowLocation('partner', bounds);

    // Default view: Turkey
    locationMap.setView([39.92, 32.85], 6);

    setTimeout(() => {
        locationMap.invalidateSize();
        if (bounds.length === 2) {
            locationMap.fitBounds(bounds, { padding: [40, 40] });
        } else if (bounds.length === 1) {
            locationMap.setView(bounds[0], 15);
        }
    }, 300);
}

async function loadAndShowLocation(who, bounds) {
    const userId = who === 'my' ? currentProfile?.id : partnerProfile?.id;
    if (!userId) return;

    const { data } = await db.from('locations').select('*').eq('user_id', userId).single();
    if (data) {
        updateLocationUI(who, data);
        bounds.push([data.lat, data.lng]);

        if (locationMap) {
            const name = who === 'my' ? currentProfile.name : partnerProfile.name;
            const icon = createMarkerIcon(who);
            const popup = who === 'my'
                ? `<b>${name}</b><br>Sen buradasın 💜`
                : `<b>${name}</b><br>Sevgilin burada 💖`;

            const marker = L.marker([data.lat, data.lng], { icon }).addTo(locationMap).bindPopup(popup);

            if (who === 'my') myMarker = marker;
            else partnerMarker = marker;
        }
    }
}

function updateMapMarker(who, loc) {
    if (!locationMap) return;

    if (who === 'my' && myMarker) {
        myMarker.setLatLng([loc.lat, loc.lng]);
    } else if (who === 'partner' && partnerMarker) {
        partnerMarker.setLatLng([loc.lat, loc.lng]);
    }
}

// Reverse geocode
async function reverseGeocode(lat, lng) {
    try {
        const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=tr&zoom=16`
        );
        const data = await resp.json();
        if (data && data.address) {
            const addr = data.address;
            const parts = [];
            if (addr.road || addr.pedestrian) parts.push(addr.road || addr.pedestrian);
            if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
            if (addr.city || addr.town || addr.county) parts.push(addr.city || addr.town || addr.county);
            return parts.join(', ') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        }
    } catch (e) {}
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
