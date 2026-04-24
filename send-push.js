const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { receiver_id, signal_type, sender_name } = req.body;

        if (!receiver_id || !signal_type) {
            return res.status(400).json({ error: 'Missing fields' });
        }

        // Signal emoji mapping
        const SIGNALS = {
            miss: { emoji: '❤️', title: 'Seni Özledim' },
            love: { emoji: '💋', title: 'Seni Seviyorum' },
            hurt: { emoji: '😔', title: 'Kırgınım' },
            angry: { emoji: '😡', title: 'Kızgınım' },
            call: { emoji: '📞', title: 'Müsaitsen Ara' },
            sleep: { emoji: '😴', title: 'Uyuyorum' },
            urgent: { emoji: '🚨', title: 'Acil Bana Yaz' },
            hug: { emoji: '🤗', title: 'Sarıl Bana' },
            happy: { emoji: '😊', title: 'Mutluyum' },
            meet: { emoji: '🫂', title: 'Buluşalım' },
        };

        const signal = SIGNALS[signal_type] || { emoji: '💌', title: signal_type };

        // Setup web-push
        webpush.setVapidDetails(
            'mailto:ask-bir-sinyal@example.com',
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );

        // Get receiver's push subscription from Supabase
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );

        const { data: subData, error: subError } = await supabase
            .from('push_subscriptions')
            .select('subscription')
            .eq('user_id', receiver_id)
            .single();

        if (subError || !subData) {
            return res.status(200).json({ sent: false, reason: 'No subscription found' });
        }

        const subscription = subData.subscription;

        // Send push notification
        const payload = JSON.stringify({
            title: `${sender_name} sana:`,
            body: `${signal.emoji} ${signal.title}`,
            icon: '/icon-192-real.png',
            badge: '/icon-192-real.png',
            data: { url: '/' },
        });

        await webpush.sendNotification(subscription, payload);

        return res.status(200).json({ sent: true });
    } catch (error) {
        console.error('Push error:', error);

        // If subscription expired, delete it
        if (error.statusCode === 410) {
            return res.status(200).json({ sent: false, reason: 'Subscription expired' });
        }

        return res.status(500).json({ error: error.message });
    }
};
