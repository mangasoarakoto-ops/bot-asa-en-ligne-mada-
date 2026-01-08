const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const { db, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc } = require('./firebase');

// --- CONFIGURATION ---
const BOT_TOKEN = "8538682604:AAH-tT7u21BBSdwuDyySY0dWMn0Pq0N-QgU";
const ADMIN_ID = "8207051152"; 

const bot = new Telegraf(BOT_TOKEN);

// --- ANTI-SLEEP SERVER ---
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
const tempFormation = {}; 

// --- MENU PRINCIPAL (UPDATE: Service Client Added) ---
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('📂 Microtache', 'cat_microtache'), Markup.button.callback('📹 Poppo Live', 'cat_poppo')],
    [Markup.button.callback('🤖 Trading Bot', 'cat_trading'), Markup.button.callback('💰 Criptomonie', 'cat_crypto')],
    [Markup.button.callback('📈 Investissement', 'cat_invest')],
    [Markup.button.url('💸 Retrait (Echange)', 'https://asaenlignemadaga.is-great.net/echange.html')],
    [Markup.button.url('📞 Service Client (WhatsApp)', 'https://wa.me/261323911654')]
]);

// --- FONCTIONS CHECK USER (UPDATE: 30 Jours Check) ---
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

    // 1. Check raha "approved" fa efa POTITRA ny 30 andro
    if (userData.status === 'approved') {
        if (userData.expiryDate) {
            const expiry = new Date(userData.expiryDate);
            const now = new Date();
            if (now > expiry) {
                // Raha efa lany ny fotoana, dia averina bloqué
                await updateDoc(userRef, { status: 'expired' });
                return ctx.reply("⚠️ **Tapitra ny fe-potoana 30 andro.**\n\nMila manavao ny fandoavanao vola ianao mba hidirana indray.", 
                    Markup.inlineKeyboard([[Markup.button.callback('🔄 Renouveler Paiement', 'pay_new')]])
                );
            }
        }
    }

    // 2. Raha tsy approved (pending, rejected, expired)
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
    if(ctx.from.id.toString() === ADMIN_ID) return sendAdminPanel(ctx);
    
    // Check Status mivantana eto mba hampihatra ny restriction
    return checkUserStatus(ctx, async () => {
         return ctx.reply("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    });
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

// --- INPUT HANDLER (TEXT) ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const text = ctx.message.text;

    if (userId === ADMIN_ID && state && state.startsWith('admin_add_')) return handleAdminInput(ctx, state, text);

    if (state === 'waiting_payment_sender') {
        await ctx.telegram.sendMessage(ADMIN_ID, 
            `💰 **Vérification Paiement**\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Sender: ${text}`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ Approuver', `approve_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_${userId}`)]])
        );
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
             ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approuver', `approve_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_${userId}`)]])
         });
         await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
         delete userStates[userId];
         return ctx.reply("✅ Nalefa any amin'ny Admin.");
    }
});

// --- INPUT HANDLER (FILES - PHOTOS/VIDEO/DOCS) ---
// Eto no ahafahana mandray fichier mivantana avy amin'ny Admin na User
bot.on(['photo', 'video', 'document', 'audio'], async (ctx) => {
    const userId = ctx.from.id.toString();
    
    // 1. Raha User mandefa sary preuve
    if (ctx.message.photo && userStates[userId] === 'waiting_old_screenshot') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userStates[userId] = 'waiting_old_note';
        userStates[userId + '_img'] = fileId; 
        return ctx.reply("Soraty ny Note kely mba hanazavana fa efa mpianatra ianao:");
    }

    // 2. Raha Admin mampiditra FORMATION (Video/Doc/Audio)
    if (userId === ADMIN_ID && userStates[userId] === 'admin_add_link_dl') {
        let fileId;
        let fileType = 'file';

        if (ctx.message.video) {
            fileId = ctx.message.video.file_id;
            fileType = 'video';
        } else if (ctx.message.document) {
            fileId = ctx.message.document.file_id;
            fileType = 'document';
        } else if (ctx.message.audio) {
            fileId = ctx.message.audio.file_id;
            fileType = 'audio';
        } else if (ctx.message.photo) {
            // Raha sary no alefany ho toy ny cours
            fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            fileType = 'photo';
        }

        if (fileId) {
            tempFormation.fileId = fileId; // Tehirizina ilay ID Telegram
            tempFormation.fileType = fileType;
            tempFormation.downloadLink = null; // Tsy link externe intsony
            
            userStates[ADMIN_ID] = 'admin_add_link_sign';
            return ctx.reply("✅ Fichier voaray!\n\n5️⃣ Lien inscription (Bouton S'inscrire) - (Soraty 'non' raha tsy misy):");
        }
    }
});

// --- ADMIN ACTIONS (UPDATE: 30 Jours + Notifications) ---
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    
    // Calcul date d'expiration (30 andro manomboka izao)
    const now = new Date();
    now.setDate(now.getDate() + 30);
    const expiryDateISO = now.toISOString();
    const dateReadable = now.toLocaleDateString('fr-FR');

    await updateDoc(doc(db, "users", targetId), { 
        status: 'approved',
        expiryDate: expiryDateISO,
        lastPaymentDate: new Date().toISOString()
    });

    // Message ho an'ny User
    await ctx.telegram.sendMessage(targetId, 
        `✅ **FELICITATION!**\n\nNekena ny kaontinao. Afaka miditra ianao izao.\n📅 Validité: 30 Jours (Mandra-pahatonga ny ${dateReadable}).`, 
        mainMenu
    );

    // Message ho an'ny Admin
    await ctx.answerCbQuery("Action effectuée: APPROUVÉ");
    try {
        await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || ''}\n\n✅ TRAITÉ: APPROUVÉ\n📅 Expire le: ${dateReadable}`);
    } catch (e) {}
    
    // Notification kely ho an'ny Admin
    await ctx.reply(`🆗 User ${targetId} Approuvé pour 30 jours.`);
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    
    await updateDoc(doc(db, "users", targetId), { status: 'rejected' });
    
    // Message ho an'ny User
    await ctx.telegram.sendMessage(targetId, "❌ **Paiement Refusé.**\n\nNanda ny fandoavanao ny Admin. Hamarino ny laharana na mifandraisa amin'ny Service Client.");
    
    // Message ho an'ny Admin
    await ctx.answerCbQuery("Action effectuée: REFUSÉ");
    try {
        await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || ''}\n\n❌ TRAITÉ: REFUSÉ`);
    } catch (e) {}
    await ctx.reply(`🚫 User ${targetId} Refusé.`);
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

bot.action('admin_add_start', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    userStates[ADMIN_ID] = 'admin_add_title';
    ctx.reply("1️⃣ Ampidiro ny **TITRE** ny formation:");
});

async function handleAdminInput(ctx, state, text) {
    if (state === 'admin_add_title') {
        tempFormation.title = text;
        userStates[ADMIN_ID] = 'admin_add_type';
        ctx.reply("2️⃣ Karazana rakitra (Video, PDF, Audio, Youtube)?");
    } else if (state === 'admin_add_type') {
        tempFormation.type = text;
        ctx.reply("3️⃣ Safidio ny Section (Category):", Markup.inlineKeyboard([
            [Markup.button.callback('Microtache', 'setcat_microtache')],
            [Markup.button.callback('Poppo Live', 'setcat_poppo')],
            [Markup.button.callback('Trading Bot', 'setcat_trading')],
            [Markup.button.callback('Criptomonie', 'setcat_crypto')],
            [Markup.button.callback('Investissement', 'setcat_invest')]
        ]));
        delete userStates[ADMIN_ID]; 
    } else if (state === 'admin_add_link_dl') {
        // Raha TEXT no nalefan'ny Admin (Lien externe: Drive, Youtube)
        tempFormation.downloadLink = text;
        tempFormation.fileId = null; // Tsy fichier Telegram
        userStates[ADMIN_ID] = 'admin_add_link_sign';
        ctx.reply("5️⃣ Lien inscription (Bouton S'inscrire) - (Soraty 'non' raha tsy misy):");
    } else if (state === 'admin_add_link_sign') {
        tempFormation.signupLink = text === 'non' ? null : text;
        userStates[ADMIN_ID] = 'admin_add_desc';
        ctx.reply("6️⃣ Description (Liste):");
    } else if (state === 'admin_add_desc') {
        tempFormation.description = text;
        await addDoc(collection(db, "formations"), tempFormation);
        ctx.reply(`✅ **Formation Voatahiry!**\n\nTitre: ${tempFormation.title}`,
            Markup.inlineKeyboard([[Markup.button.callback('➕ Ajouter une autre', 'admin_add_start')]])
        );
        delete userStates[ADMIN_ID];
    }
}

const cats = ['microtache', 'poppo', 'trading', 'crypto', 'invest'];
cats.forEach(c => {
    bot.action(`setcat_${c}`, (ctx) => {
        tempFormation.category = c;
        userStates[ADMIN_ID] = 'admin_add_link_dl';
        // Message modifiée:
        ctx.reply(`Section voafidy: ${c.toUpperCase()}\n\n4️⃣ **Safidy roa:**\n- Soraty ny Lien (Drive/Youtube)\n- NA alefaso eto ny Fichier/Video (Telegram File):`);
    });
});

// --- USER VIEW CONTENT (UPDATE: File Handling) ---
cats.forEach(cat => {
    bot.action(`cat_${cat}`, async (ctx) => {
        // Check indray ny 30 jours eto mba tsy hisy "leak"
        return checkUserStatus(ctx, async () => {
            const userId = ctx.from.id.toString();
            if (userId !== ADMIN_ID) {
                // Efa voavaha ao amin'ny checkUserStatus ny redirection, fa averina kely eto ny verification raha tiana
                const userSnap = await getDoc(doc(db, "users", userId));
                if (!userSnap.exists() || userSnap.data().status !== 'approved') return;
            }

            await ctx.answerCbQuery();
            await ctx.reply(`📂 **Section: ${cat.toUpperCase()}**\n\nMitady...`);
            
            const q = collection(db, "formations"); 
            const querySnapshot = await getDocs(q);
            let found = false;
            
            // Loop async tsotra
            for (const formationDoc of querySnapshot.docs) {
                const data = formationDoc.data();
                if (data.category === cat) {
                    found = true;
                    
                    const buttonsRow = [];
                    if (data.signupLink) buttonsRow.push(Markup.button.url('✍️ S\'inscrire', data.signupLink));
                    
                    // Logic bouton Telecharger (Raha lien)
                    if (data.downloadLink) buttonsRow.push(Markup.button.url('📥 Voir / Télécharger', data.downloadLink));
                    
                    if (ctx.from.id.toString() === ADMIN_ID) {
                        buttonsRow.push(Markup.button.callback('🗑️ Supprimer', `delete_${formationDoc.id}`));
                    }

                    // Asehoy ny hafatra na ny fichier
                    const captionText = `🎓 **${data.title}**\n\n📝 ${data.description}\n\n📂 Type: ${data.type}`;
                    
                    if (data.fileId) {
                        // Raha fichier Telegram ilay izy
                        const opts = { caption: captionText, parse_mode: 'Markdown', reply_markup: { inline_keyboard: [buttonsRow] } };
                        if (data.fileType === 'video') await ctx.replyWithVideo(data.fileId, opts);
                        else if (data.fileType === 'document') await ctx.replyWithDocument(data.fileId, opts);
                        else if (data.fileType === 'audio') await ctx.replyWithAudio(data.fileId, opts);
                        else if (data.fileType === 'photo') await ctx.replyWithPhoto(data.fileId, opts);
                    } else {
                        // Raha lien tsotra
                        await ctx.replyWithMarkdown(captionText, Markup.inlineKeyboard([buttonsRow]));
                    }
                }
            }
            if (!found) ctx.reply("⚠️ Mbola tsy misy formation.");
        });
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
        await ctx.answerCbQuery('Formation supprimée ✅');
        await ctx.reply(`✅ Formation (${formationId}) voafafa.`);
    } catch (err) {
        console.error('Delete error:', err);
        await ctx.answerCbQuery('Nisy olana tamin\'ny famafana.');
    }
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
