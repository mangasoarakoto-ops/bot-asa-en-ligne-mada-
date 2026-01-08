// bot.js
const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');
const { db, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs } = require('./firebase');

// --- CONFIGURATION MIVANTANA ---
const BOT_TOKEN = "8538682604:AAH-tT7u21BBSdwuDyySY0dWMn0Pq0N-QgU";
const ADMIN_ID = "8207051152"; 

const bot = new Telegraf(BOT_TOKEN);

// --- SERVER EXPRESS (Mba tsy hatory ny bot amin'ny Render) ---
const app = express();
app.get('/', (req, res) => res.send('Bot Asa En Ligne Mada is Running...'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// --- VARIABLES GLOBALES ---
const userStates = {}; 
const tempFormation = {}; // Ho an'ny Admin rehefa mamorona video

// --- MENU PRINCIPAL (User Approuvé) ---
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('📂 Microtache', 'cat_microtache'), Markup.button.callback('📹 Poppo Live', 'cat_poppo')],
    [Markup.button.callback('🤖 Trading Bot', 'cat_trading'), Markup.button.callback('💰 Criptomonie', 'cat_crypto')],
    [Markup.button.callback('📈 Investissement', 'cat_invest')],
    [Markup.button.url('💸 Retrait (Echange)', 'https://asaenlignemadaga.is-great.net/echange.html')]
]);

// --- FONCTIONS CHECK USER ---
async function checkUserStatus(ctx, next) {
    const userId = ctx.from.id.toString();
    
    // Admin Bypass
    if (userId === ADMIN_ID) {
        ctx.state.isAdmin = true;
        return next();
    }

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        return ctx.reply("👋 Miarahaba! Tsindrio ny bokotra eto ambany mba handefasana ny laharanao (Contact) alohan'ny hidirana.", 
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

Rehefa vita, safidio ny eto ambany:
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ J\'ai payé', 'pay_new')],
        [Markup.button.callback('🔄 J\'ai déjà un compte', 'pay_old')]
    ]));
}

// --- START COMMAND ---
bot.start(async (ctx) => {
    // Admin Panel avy hatrany raha Admin
    if(ctx.from.id.toString() === ADMIN_ID) {
        return sendAdminPanel(ctx);
    }

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
        phoneNumber: phoneNumber,
        telegramId: userId,
        firstName: ctx.from.first_name,
        status: 'pending_payment',
        joinedAt: new Date().toISOString()
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

// --- TEXT HANDLING (Inputs) ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const text = ctx.message.text;

    // ADMIN LOGIC
    if (userId === ADMIN_ID && state && state.startsWith('admin_add_')) {
        return handleAdminInput(ctx, state, text);
    }

    // USER LOGIC
    if (state === 'waiting_payment_sender') {
        await ctx.telegram.sendMessage(ADMIN_ID, 
            `💰 **Vérification Paiement**\n\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Sender: ${text}\n`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Approuver', `approve_${userId}`)],
                [Markup.button.callback('❌ Refuser', `reject_${userId}`)]
            ])
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
             caption: `🔄 **Ancien Compte**\n\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Ancien Num: ${oldPhone}\n🗒️ Note: ${text}`,
             ...Markup.inlineKeyboard([
                [Markup.button.callback('✅ Approuver', `approve_${userId}`)],
                [Markup.button.callback('❌ Refuser', `reject_${userId}`)]
            ])
         });

         await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
         delete userStates[userId];
         return ctx.reply("✅ Nalefa any amin'ny Admin ny fanazavanao.");
    }
});

// --- IMAGE HANDLING (Screenshot) ---
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id.toString();
    if (userStates[userId] === 'waiting_old_screenshot') {
        const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        userStates[userId] = 'waiting_old_note';
        userStates[userId + '_img'] = fileId; 
        return ctx.reply("Soraty ny Note kely mba hanazavana fa efa mpianatra ianao:");
    }
});

// --- ADMIN ACTIONS (APPROVE/REJECT) ---
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    
    await updateDoc(doc(db, "users", targetId), { status: 'approved' });
    await ctx.telegram.sendMessage(targetId, "✅ Arahabaina! Nekena ny kaontinao. Afaka miditra ianao izao.", mainMenu);
    await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || ''}\n\n✅ TRAITÉ: APPROUVÉ`);
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    
    await updateDoc(doc(db, "users", targetId), { status: 'rejected' });
    await ctx.telegram.sendMessage(targetId, "❌ Nanda ny fandoavanao ny Admin. Avereno jerena ny procédure.");
    await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || ''}\n\n❌ TRAITÉ: REFUSÉ`);
});

// --- ADMIN PANEL & GESTION FORMATION ---
function sendAdminPanel(ctx) {
    ctx.reply("🔧 **ADMINISTRATION**\nMisafidiana action:", Markup.inlineKeyboard([
        [Markup.button.callback('➕ Ajouter Formation', 'admin_add_start')],
        [Markup.button.callback('🏠 Accueil', 'admin_home')]
    ]));
}

bot.action('admin_home', (ctx) => ctx.reply("Mode Admin Actif.", Markup.removeKeyboard()));

// Wizard famoronana formation
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
        // Mampiasa buttons hisafidianana category mba tsy hisy diso
        ctx.reply("3️⃣ Safidio ny Section (Category):", Markup.inlineKeyboard([
            [Markup.button.callback('Microtache', 'setcat_microtache')],
            [Markup.button.callback('Poppo Live', 'setcat_poppo')],
            [Markup.button.callback('Trading Bot', 'setcat_trading')],
            [Markup.button.callback('Criptomonie', 'setcat_crypto')],
            [Markup.button.callback('Investissement', 'setcat_invest')]
        ]));
        // Note: Tsy miandry text intsony fa miandry callback
        delete userStates[ADMIN_ID]; 

    } else if (state === 'admin_add_link_dl') {
        tempFormation.downloadLink = text;
        userStates[ADMIN_ID] = 'admin_add_link_sign';
        ctx.reply("5️⃣ Lien inscription (Bouton S'inscrire) - (Soraty 'non' raha tsy misy):");
    
    } else if (state === 'admin_add_link_sign') {
        tempFormation.signupLink = text === 'non' ? null : text;
        userStates[ADMIN_ID] = 'admin_add_desc';
        ctx.reply("6️⃣ Description (Liste):");
    
    } else if (state === 'admin_add_desc') {
        tempFormation.description = text;
        
        // Save to Firestore
        await addDoc(collection(db, "formations"), tempFormation);
        
        ctx.reply(`✅ **Formation Voatahiry!**\n\nTitre: ${tempFormation.title}\nSection: ${tempFormation.category}\n`,
            Markup.inlineKeyboard([[Markup.button.callback('➕ Ajouter une autre', 'admin_add_start')]])
        );
        delete userStates[ADMIN_ID];
    }
}

// Handler manokana ho an'ny safidy Category (Admin)
const cats = ['microtache', 'poppo', 'trading', 'crypto', 'invest'];
cats.forEach(c => {
    bot.action(`setcat_${c}`, (ctx) => {
        tempFormation.category = c;
        userStates[ADMIN_ID] = 'admin_add_link_dl';
        ctx.reply(`Section voafidy: ${c.toUpperCase()}\n\n4️⃣ Ampidiro ny Lien téléchargement (na ID video Telegram):`);
    });
});

// --- USER VIEWING CONTENT (ALL SECTIONS) ---
const userCats = ['microtache', 'poppo', 'trading', 'crypto', 'invest'];

userCats.forEach(cat => {
    bot.action(`cat_${cat}`, async (ctx) => {
        // Security check
        const userRef = doc(db, "users", ctx.from.id.toString());
        const userSnap = await getDoc(userRef);
        if (ctx.from.id.toString() !== ADMIN_ID && (!userSnap.exists() || userSnap.data().status !== 'approved')) {
            return ctx.reply("⛔ Tsy mahazo miditra eto ianao.");
        }

        ctx.reply(`📂 **Section: ${cat.toUpperCase()}**\n\nMitady ireo formation...`);
        
        const q = collection(db, "formations"); 
        const querySnapshot = await getDocs(q);
        
        let found = false;
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Check raha mifanaraka ny category
            if (data.category === cat) {
                found = true;
                const caption = `🎓 **${data.title}**\n\n📝 ${data.description}\n\n📂 Type: ${data.type}`;
                const buttons = [];
                if(data.signupLink) buttons.push(Markup.button.url('✍️ S\'inscrire', data.signupLink));
                if(data.downloadLink) buttons.push(Markup.button.url('📥 Voir / Télécharger', data.downloadLink));

                ctx.replyWithMarkdown(caption, Markup.inlineKeyboard([buttons]));
            }
        });

        if (!found) ctx.reply("⚠️ Mbola tsy misy formation ato amin'ity section ity.");
    });
});

// START
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
