const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const { db, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc } = require('./firebase');

// --- CONFIGURATION ---
const BOT_TOKEN = "8538682604:AAH-tT7u21BBSdwuDyySY0dWMn0Pq0N-QgU";
const ADMIN_ID = "8207051152";

const bot = new Telegraf(BOT_TOKEN);

// --- ANTI-SLEEP SERVER (MAHERY VAIKA) ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('Bot Asa En Ligne Mada : ACTIVE (✅)');
});
app.get('/ping', (req, res) => {
    console.log(`🔔 Ping voaray tamin'ny: ${new Date().toISOString()}`);
    res.status(200).send('Pong!');
});
app.listen(PORT, () => {
    console.log(`🚀 Server mihodina ao amin'ny port ${PORT}`);
});

// --- VARIABLES GLOBALES ---
const userStates = {};
const tempFormation = {}; // store current admin adding formation (per-admin would be better if multi-admin)

// --- MENU PRINCIPAL ---
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('📂 Microtache', 'cat_microtache'), Markup.button.callback('📹 Poppo Live', 'cat_poppo')],
    [Markup.button.callback('🤖 Trading Bot', 'cat_trading'), Markup.button.callback('💰 Criptomonie', 'cat_crypto')],
    [Markup.button.callback('📈 Investissement', 'cat_invest')],
    [Markup.button.url('💸 Retrait (Echange)', 'https://asaenlignemadaga.is-great.net/echange.html')]
]);

// --- FONCTIONS CHECK USER ---
async function checkUserStatus(ctx, next) {
    const userId = ctx.from.id.toString();
    if (userId === ADMIN_ID) {
        ctx.state.isAdmin = true;
        return next();
    }
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        return ctx.reply("👋 Miarahaba! Tsindrio ny bokotra eto ambany mba handefasana ny laharanao (Contact).",
            Markup.keyboard([[Markup.button.contactRequest('📱 Hizara ny laharan-telefaonina')]]).resize()
        );
    }
    const userData = userSnap.data();
    if (userData.status !== 'approved') {
        if (userData.status === 'pending_verification') {
            return ctx.reply("⏳ Efa voaray ny fangatahanao. Miandry fankatoavana avy amin'ny Admin.");
        }
        return showPaymentPage(ctx);
    }
    return next();
}

// --- PAGE PAIEMENT ---
async function showPaymentPage(ctx) {
    const msg = `
🔐 **Fepetra hidirana:**
Mila mandoa droit de formation **1500 Ar/mois** ianao vao afaka miditra.

Alefaso amin'ireto laharana ireto ny vola:
➡️ 032 39 116 54
➡️ 033 36 351 11
➡️ 038 22 668 76

Safidio avy eo:
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ J\'ai payé', 'pay_new')],
        [Markup.button.callback('🔄 J\'ai déjà un compte', 'pay_old')]
    ]));
}

// --- START COMMAND ---
bot.start(async (ctx) => {
    if (ctx.from.id.toString() === ADMIN_ID) return sendAdminPanel(ctx);
    const userRef = doc(db, "users", ctx.from.id.toString());
    const userSnap = await getDoc(userRef);
    if (userSnap.exists() && userSnap.data().status === 'approved') {
        return ctx.reply("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    } else {
        return checkUserStatus(ctx, () => {});
    }
});

// --- RECEPTION CONTACT ---
bot.on('contact', async (ctx) => {
    const userId = ctx.from.id.toString();
    const phoneNumber = ctx.message.contact.phone_number;
    await setDoc(doc(db, "users", userId), {
        phoneNumber: phoneNumber, telegramId: userId, firstName: ctx.from.first_name,
        status: 'pending_payment', joinedAt: new Date().toISOString()
    }, { merge: true });
    await ctx.reply("✅ Voaray ny laharanao.", Markup.removeKeyboard());
    return showPaymentPage(ctx);
});

// --- PAIEMENT LOGIC ---
bot.action('pay_new', (ctx) => {
    userStates[ctx.from.id] = 'waiting_payment_sender';
    ctx.reply("Soraty ny laharana nandefasanao ny vola (ohatra: 034xxxxxxx):");
});
bot.action('pay_old', (ctx) => {
    userStates[ctx.from.id] = 'waiting_old_phone';
    ctx.reply("Soraty ny laharana nampiasainao tao amin'ny site taloha:");
});

// --- INPUT HANDLER ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const text = ctx.message.text;

    // Admin input for adding formation
    if (userId === ADMIN_ID && state && state.startsWith('admin_add_')) return handleAdminInput(ctx, state, text);

    if (state === 'waiting_payment_sender') {
        // send to admin for verification with approve/reject
        await ctx.telegram.sendMessage(ADMIN_ID,
            `💰 *Vérification Paiement*\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Sender: ${text}`,
            {
                parse_mode: 'Markdown',
                reply_markup: Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Approuver', `approve_${userId}`), Markup.button.callback('❌ Refuser', `reject_${userId}`)]
                ]).reply_markup
            }
        ).catch(e => console.error('Send to admin error:', e));
        await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
        delete userStates[userId];
        return ctx.reply("✅ Nalefa any amin'ny Admin. Miandrasa kely.");
    }

    if (state === 'waiting_old_phone') {
        userStates[userId] = 'waiting_old_screenshot';
        userStates[userId + '_phone'] = text;
        return ctx.reply("Alefaso sary (Capture d'écran) ny compte taloha:");
    }

    if (state === 'waiting_old_note') {
        const oldPhone = userStates[userId + '_phone'];
        const fileId = userStates[userId + '_img'];
        await ctx.telegram.sendPhoto(ADMIN_ID, fileId, {
            caption: `🔄 **Ancien Compte**\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Ancien Num: ${oldPhone}\n🗒️ Note: ${text}`,
            parse_mode: 'Markdown',
            reply_markup: Markup.inlineKeyboard([
                [Markup.button.callback('✅ Approuver', `approve_${userId}`), Markup.button.callback('❌ Refuser', `reject_${userId}`)]
            ]).reply_markup
        });
        await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
        delete userStates[userId];
        return ctx.reply("✅ Nalefa any amin'ny Admin.");
    }
});

// --- IMAGE / VIDEO / DOCUMENT HANDLER FOR OLD ACCOUNT ---
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userStates[userId] === 'waiting_old_screenshot') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userStates[userId] = 'waiting_old_note';
        userStates[userId + '_img'] = fileId;
        return ctx.reply("Soraty ny Note kely mba hanazavana fa efa mpianatra ianao:");
    }
});

// --- ADMIN ACTIONS: approve / reject payment ---
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await ctx.answerCbQuery('Tsy manana fahazoan-dàlana ianao.');
        return;
    }
    const targetId = ctx.match[1];
    try {
        await updateDoc(doc(db, "users", targetId), { status: 'approved' });
    } catch (e) {
        console.error('Firestore update user status error:', e);
    }

    // Notify target user (with main menu). Catch errors if user hasn't started bot.
    try {
        await ctx.telegram.sendMessage(targetId, "✅ Arahabaina! Nekena ny kaontinao. Afaka miditra ianao izao.", {
            parse_mode: 'Markdown',
            reply_markup: mainMenu.reply_markup
        });
    } catch (e) {
        console.warn(`Unable to notify user ${targetId}:`, e.message);
        // inform admin that user couldn't be notified
        await ctx.reply(`⚠️ Tsy afaka nandefa confirmation tamin'ny user (ID: ${targetId}). Mety tsy nanomboka ny bot ny user.`);
    }

    // Edit admin's payment message to mark processed if possible
    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.editMessageText((ctx.callbackQuery.message.text || '') + `\n\n✅ TRAITÉ: APPROUVÉ`);
        }
    } catch (e) {
        // ignore; maybe message isn't editable
    }

    await ctx.answerCbQuery('User approuvé ✅');
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await ctx.answerCbQuery('Tsy manana fahazoan-dàlana ianao.');
        return;
    }
    const targetId = ctx.match[1];
    try {
        await updateDoc(doc(db, "users", targetId), { status: 'rejected' });
    } catch (e) {
        console.error('Firestore update user status error:', e);
    }

    try {
        await ctx.telegram.sendMessage(targetId, "❌ Nanda ny fandoavanao ny Admin.");
    } catch (e) {
        console.warn(`Unable to notify user ${targetId}:`, e.message);
        await ctx.reply(`⚠️ Tsy afaka nandefa notification ny user (ID: ${targetId}).`);
    }

    try {
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.editMessageText((ctx.callbackQuery.message.text || '') + `\n\n❌ TRAITÉ: REFUSÉ`);
        }
    } catch (e) {
        // ignore
    }

    await ctx.answerCbQuery('User refusé ❌');
});

// --- ADMIN PANEL ---
function sendAdminPanel(ctx) {
    ctx.reply("🔧 **ADMINISTRATION**", Markup.inlineKeyboard([
        [Markup.button.callback('➕ Ajouter Formation', 'admin_add_start')],
        [Markup.button.callback('🏠 Accueil', 'admin_home')]
    ]));
}
bot.action('admin_home', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.answerCbQuery();
    await ctx.reply("👋 Tongasoa Admin! Ity ny Accueil / Menu Principal :", mainMenu);
});

// --- ADMIN: add formation flow ---
bot.action('admin_add_start', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    userStates[ADMIN_ID] = 'admin_add_title';
    // reset tempFormation for new add
    tempFormation.title = null;
    tempFormation.type = null;
    tempFormation.category = null;
    tempFormation.downloadLink = null;
    tempFormation.isTelegramFile = false;
    tempFormation.fileType = null;
    tempFormation.signupLink = null;
    tempFormation.description = null;
    ctx.reply("1️⃣ Ampidiro ny **TITRE** ny formation:");
});

async function handleAdminInput(ctx, state, text) {
    if (state === 'admin_add_title') {
        tempFormation.title = text;
        userStates[ADMIN_ID] = 'admin_add_type';
        ctx.reply("2️⃣ Karazana rakitra (Video, PDF, Audio, Youtube, Lien)?");
    } else if (state === 'admin_add_type') {
        tempFormation.type = text;
        userStates[ADMIN_ID] = 'admin_add_category';
        ctx.reply("3️⃣ Safidio ny Section (Category):", Markup.inlineKeyboard([
            [Markup.button.callback('Microtache', 'setcat_microtache')],
            [Markup.button.callback('Poppo Live', 'setcat_poppo')],
            [Markup.button.callback('Trading Bot', 'setcat_trading')],
            [Markup.button.callback('Criptomonie', 'setcat_crypto')],
            [Markup.button.callback('Investissement', 'setcat_invest')]
        ]));
    } else if (state === 'admin_add_link_dl') {
        // admin provided a link (http) as downloadLink
        if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('www.'))) {
            tempFormation.downloadLink = text;
            tempFormation.isTelegramFile = false;
            userStates[ADMIN_ID] = 'admin_add_link_sign';
            ctx.reply("5️⃣ Lien inscription (Bouton S'inscrire) - (Soraty 'non' raha tsy misy):");
        } else {
            // treat as plain text link or id; still accept
            tempFormation.downloadLink = text;
            tempFormation.isTelegramFile = false;
            userStates[ADMIN_ID] = 'admin_add_link_sign';
            ctx.reply("5️⃣ Lien inscription (Bouton S'inscrire) - (Soraty 'non' raha tsy misy):");
        }
    } else if (state === 'admin_add_link_sign') {
        tempFormation.signupLink = (text === 'non') ? null : text;
        userStates[ADMIN_ID] = 'admin_add_desc';
        ctx.reply("6️⃣ Description (Liste):");
    } else if (state === 'admin_add_desc') {
        tempFormation.description = text;
        // save to Firestore
        try {
            await addDoc(collection(db, "formations"), {
                title: tempFormation.title,
                type: tempFormation.type,
                category: tempFormation.category,
                downloadLink: tempFormation.downloadLink || null,
                isTelegramFile: !!tempFormation.isTelegramFile,
                fileType: tempFormation.fileType || null,
                signupLink: tempFormation.signupLink || null,
                description: tempFormation.description || null,
                createdAt: new Date().toISOString()
            });
            ctx.reply(`✅ **Formation Voatahiry!**\n\nTitre: ${tempFormation.title}`,
                Markup.inlineKeyboard([[Markup.button.callback('➕ Ajouter une autre', 'admin_add_start')]])
            );
        } catch (e) {
            console.error('Error saving formation:', e);
            ctx.reply('❌ Tsy nahomby ny fanoratana formation. Jereo ny logs.');
        }
        // clear state
        delete userStates[ADMIN_ID];
        // clear tempFormation (optional)
        Object.keys(tempFormation).forEach(k => delete tempFormation[k]);
    } else if (state === 'admin_add_category') {
        // This state handled by callback 'setcat_x' - so here no-op
    }
}

// category callbacks - when admin selects category, ask for download link OR upload file
const cats = ['microtache', 'poppo', 'trading', 'crypto', 'invest'];
cats.forEach(c => {
    bot.action(`setcat_${c}`, (ctx) => {
        if (ctx.from.id.toString() !== ADMIN_ID) return;
        tempFormation.category = c;
        userStates[ADMIN_ID] = 'admin_add_link_dl';
        ctx.reply(`Section voafidy: ${c.toUpperCase()}\n\n4️⃣ Ampidiro ny Lien téléchargement (na ID video Telegram) NA alefaso mivantana eto ny fichier (video/document).`);
    });
});

// Handle video/document upload from admin when in admin_add_link_dl state
bot.on('video', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (userStates[userId] === 'admin_add_link_dl') {
        const fileId = ctx.message.video.file_id;
        tempFormation.downloadLink = fileId;
        tempFormation.isTelegramFile = true;
        tempFormation.fileType = 'video';
        userStates[ADMIN_ID] = 'admin_add_link_sign';
        return ctx.reply("✅ Video voaray. 5️⃣ Lien inscription (Soraty 'non' raha tsy misy):");
    }
});
bot.on('document', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userId !== ADMIN_ID) return;
    if (userStates[userId] === 'admin_add_link_dl') {
        const fileId = ctx.message.document.file_id;
        tempFormation.downloadLink = fileId;
        tempFormation.isTelegramFile = true;
        tempFormation.fileType = 'document';
        userStates[ADMIN_ID] = 'admin_add_link_sign';
        return ctx.reply("✅ Document voaray. 5️⃣ Lien inscription (Soraty 'non' raha tsy misy):");
    }
});

// --- USER VIEW CONTENT ---
// When showing formations: support both link downloads and Telegram-file uploads, and add delete button for admin
cats.forEach(cat => {
    bot.action(`cat_${cat}`, async (ctx) => {
        const userRef = doc(db, "users", ctx.from.id.toString());
        const userSnap = await getDoc(userRef);
        if (ctx.from.id.toString() !== ADMIN_ID && (!userSnap.exists() || userSnap.data().status !== 'approved')) {
            await ctx.answerCbQuery();
            return ctx.reply("⛔ Tsy mahazo miditra eto ianao.");
        }
        await ctx.answerCbQuery();
        await ctx.reply(`📂 **Section: ${cat.toUpperCase()}**\n\nMitady...`);
        const q = collection(db, "formations");
        const querySnapshot = await getDocs(q);
        let found = false;
        querySnapshot.forEach((formationDoc) => {
            const data = formationDoc.data();
            if (data.category === cat) {
                found = true;
                const buttonsRow = [];
                if (data.signupLink) buttonsRow.push(Markup.button.url('✍️ S\'inscrire', data.signupLink));
                // If downloadLink is a normal URL, show button; if it's a Telegram file id, we will send file directly
                if (data.downloadLink && !data.isTelegramFile) buttonsRow.push(Markup.button.url('📥 Voir / Télécharger', data.downloadLink));
                if (ctx.from.id.toString() === ADMIN_ID) {
                    buttonsRow.push(Markup.button.callback('🗑️ Supprimer', `delete_${formationDoc.id}`));
                }
                const keyboard = Markup.inlineKeyboard([buttonsRow]);

                const caption = `🎓 *${data.title}*\n\n📝 ${data.description || ''}\n\n📂 Type: ${data.type || ''}`;

                // If telegram-file saved, send as video/document with caption and keyboard
                if (data.isTelegramFile && data.fileType === 'video') {
                    ctx.replyWithVideo(data.downloadLink, { caption, parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
                } else if (data.isTelegramFile && data.fileType === 'document') {
                    ctx.replyWithDocument(data.downloadLink, { caption, parse_mode: 'Markdown', reply_markup: keyboard.reply_markup });
                } else {
                    // plain message with markdown + buttons
                    ctx.replyWithMarkdown(caption, keyboard);
                }
            }
        });
        if (!found) ctx.reply("⚠️ Mbola tsy misy formation.");
    });
});

// --- DELETE FORMATION (ADMIN) ---
bot.action(/delete_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        await ctx.answerCbQuery('Tsy manana fahazoan-dàlana ianao.');
        return;
    }
    const formationId = ctx.match[1];
    try {
        await deleteDoc(doc(db, "formations", formationId));
        // Try to edit the message where delete was clicked to reflect removal (if possible)
        try {
            if (ctx.callbackQuery && ctx.callbackQuery.message) {
                await ctx.editMessageText('🗑️ Ity formation ity dia voafafa.');
            }
        } catch (e) {
            // ignore edit errors
        }
        await ctx.answerCbQuery('Formation supprimée ✅');
        await ctx.reply(`✅ Formation (${formationId}) voafafa.`);
    } catch (err) {
        console.error('Delete error:', err);
        await ctx.answerCbQuery('Nisy olana tamin\'ny famafana.');
        await ctx.reply('❌ Nisy olana tamin\'ny famafana ao amin\'ny Firestore. Jereo ny logs.');
    }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
