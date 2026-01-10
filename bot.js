const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// --- FIREBASE IMPORT ---
// ZAVA-DEHIBE: Hamarino fa ao amin'ny 'firebase.js' dia misy 'export' an'ireo rehetra ireo
// Raha tsy mandeha ny 'increment', dia jereo ny firebase.js anao
const { db, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, where, increment } = require('./firebase');

// --- CONFIGURATION ---
const BOT_TOKEN = "8538682604:AAH-tT7u21BBSdwuDyySY0dWMn0Pq0N-QgU";
const ADMIN_ID = "8207051152"; 
const PRICE_SUBSCRIPTION = "1500 Ar";
const PRICE_ROBOT = "15000 Ar";

const bot = new Telegraf(BOT_TOKEN);

// --- ANTI-SLEEP SERVER ---
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('Bot Asa En Ligne Mada : ACTIVE (✅)'));
app.get('/ping', (req, res) => res.status(200).send('Pong!'));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// --- VARIABLES GLOBALES ---
const userStates = {}; 
const tempFormation = {}; 
const editingState = {}; 

// --- MENU PRINCIPAL ---
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('📂 Microtache', 'cat_microtache'), Markup.button.callback('📹 Poppo Live', 'cat_poppo')],
    [Markup.button.callback('🤖 Trading Bot (Gratuit)', 'cat_trading'), Markup.button.callback('💰 Criptomonie', 'cat_crypto')],
    [Markup.button.callback('📈 Investissement', 'cat_invest')],
    [Markup.button.callback('💎 Vente Robot PRO ⭐', 'cat_vente_robot')], 
    [Markup.button.url('💸 Retrait (Echange)', 'https://asaenlignemadaga.is-great.net/echange.html')],
    [Markup.button.callback('🔗 Mon Lien de Parrainage', 'my_referral')]
]);

const backButton = Markup.button.callback('🏠 Retour Menu', 'return_home');

// --- CHECK 30 JOURS ---
function isExpired(approvedDateStr) {
    if (!approvedDateStr) return true;
    const approvedDate = new Date(approvedDateStr);
    const now = new Date();
    const diffTime = Math.abs(now - approvedDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    return diffDays > 30; // 30 Jours Validité
}

// --- MIDDLEWARE STATUS ---
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
        return showPaymentPage(ctx, false);
    }

    if (userData.approvedAt && isExpired(userData.approvedAt)) {
        await updateDoc(userRef, { status: 'expired' });
        return showPaymentPage(ctx, true);
    }

    return next();
}

// --- PAGE PAIEMENT ---
async function showPaymentPage(ctx, isRenewal = false) {
    const title = isRenewal ? "⚠️ **TAPITRA NY 30 ANDRO**" : "🔐 **FEPETRA HIDIRANA**";
    const subtext = isRenewal 
        ? "Tapitra ny fe-potoana 30 andro. Mila manavao ny fandoavana **1500 Ar** ianao mba hidirana indray."
        : "Mila mandoa droit de formation **1500 Ar/mois** ianao vao afaka miditra.";

    const msg = `
${title}

${subtext}

Alefaso amin'ireto laharana ireto ny vola:
➡️ 032 39 116 54
➡️ 033 36 351 11
➡️ 038 22 668 76

Rehefa vita, tsindrio ny **"✅ J'ai payé"**.
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ J\'ai payé', 'pay_new')],
        [Markup.button.callback('🔄 J\'ai déjà un compte', 'pay_old')]
    ]));
}

// --- START COMMAND ---
bot.start(async (ctx) => {
    const userId = ctx.from.id.toString();
    const startPayload = ctx.startPayload; 

    if(userId === ADMIN_ID) return sendAdminPanel(ctx);

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists() && startPayload && startPayload !== userId) {
        userStates[userId + '_referrer'] = startPayload;
    }

    if (userSnap.exists() && userSnap.data().status === 'approved') {
        if (userSnap.data().approvedAt && isExpired(userSnap.data().approvedAt)) {
             await updateDoc(userRef, { status: 'expired' });
             return showPaymentPage(ctx, true);
        }
        return ctx.reply("👋 Tongasoa indray eto amin'ny Asa En Ligne Mada!", mainMenu);
    } else {
        return checkUserStatus(ctx, () => {}); 
    }
});

// --- RECEPTION CONTACT ---
bot.on('contact', async (ctx) => {
    const userId = ctx.from.id.toString();
    const phoneNumber = ctx.message.contact.phone_number;
    const referrerId = userStates[userId + '_referrer'] || null;

    const userData = {
        phoneNumber: phoneNumber, 
        telegramId: userId, 
        firstName: ctx.from.first_name,
        status: 'pending_payment', 
        joinedAt: new Date().toISOString(),
        referralCount: 0,
        robotAccess: false 
    };

    if (referrerId) {
        userData.referredBy = referrerId;
    }

    await setDoc(doc(db, "users", userId), userData, { merge: true });
    delete userStates[userId + '_referrer'];
    await ctx.reply("✅ Voaray ny laharanao.", Markup.removeKeyboard());
    return showPaymentPage(ctx);
});

// --- NAVIGATION ---
bot.action('return_home', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        if (ctx.from.id.toString() === ADMIN_ID) {
             return ctx.editMessageText("👋 Tongasoa eto amin'ny Menu Principal:", mainMenu);
        }
        const userRef = doc(db, "users", ctx.from.id.toString());
        const snap = await getDoc(userRef);
        if(snap.exists() && isExpired(snap.data().approvedAt)) {
            return showPaymentPage(ctx, true);
        }
        await ctx.editMessageText("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    } catch (e) {
        await ctx.reply("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    }
});

// --- PAIEMENT HANDLERS ---
bot.action('pay_new', (ctx) => {
    userStates[ctx.from.id] = 'waiting_payment_sender';
    ctx.reply("Soraty ny laharana nandefasanao ny vola (ohatra: 034xxxxxxx):");
});
bot.action('pay_old', (ctx) => {
    userStates[ctx.from.id] = 'waiting_old_phone';
    ctx.reply("Soraty ny laharana nampiasainao tao amin'ny site taloha:");
});

// --- ROBOT SECTION ---
bot.action('cat_vente_robot', async (ctx) => {
    const userId = ctx.from.id.toString();
    const userRef = doc(db, "users", userId);
    const snap = await getDoc(userRef);
    
    if (snap.exists() && snap.data().robotAccess === true) {
        return showRobotContent(ctx);
    }

    const msg = `
🤖 **VENTE ROBOT TRADING PRO**

Ity dia Robot Pro natao hanampy anao hahazo tombony bebe kokoa.

💰 **Vidiny:** 15,000 Ar
🎁 **Bonus:** Manana robot 7 ianao ao anatiny.

Te hanohy ve ianao?
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ Accepté', 'robot_step_2')],
        [Markup.button.callback('❌ Annuler', 'return_home')]
    ]));
});

bot.action('robot_step_2', async (ctx) => {
    const msg = `
⚙️ **FAMPIASANA NY ROBOT**

✅ Hahazo **Robot 7** samihafa ianao.
✅ Ny robot iray dia ampiasaina **indray mandeha (1 fois)** isan-kerinandro.
✅ **Démarrage:** Indray mandeha isan'andro (Une fois par jour) ihany no alefa ny robot.
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ Accepté (Mandoa vola)', 'robot_step_pay')],
        [Markup.button.callback('❌ Annuler', 'return_home')]
    ]));
});

bot.action('robot_step_pay', async (ctx) => {
    const msg = `
💳 **FANDOAVANA VOLA - ROBOT PRO**

Alefaso ny **15,000 Ar** amin'ny:
➡️ 032 39 116 54
➡️ 033 36 351 11
➡️ 038 22 668 76

Tsindrio ny **"✅ J'ai payé"** rehefa vita.
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([
        [Markup.button.callback('✅ J\'ai payé', 'robot_confirm_pay')],
        [Markup.button.callback('❌ Annuler', 'return_home')]
    ]));
});

bot.action('robot_confirm_pay', (ctx) => {
    userStates[ctx.from.id] = 'waiting_robot_sender_num';
    ctx.reply("Soraty ny **LAHARANA** nandefasanao ny vola (Robot 15000Ar):");
});

// --- INPUTS HANDLER ---
bot.on(['text', 'photo', 'video', 'document', 'audio'], async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    const text = ctx.message.text;
    
    if (userId === ADMIN_ID) {
        if (state && (state.startsWith('admin_add_') || state.startsWith('admin_edit_'))) {
            return handleAdminInput(ctx, state);
        }
    }

    if (!text && state !== 'waiting_old_screenshot') return;

    // --- ABONNEMENT ---
    if (state === 'waiting_payment_sender') {
        await ctx.telegram.sendMessage(ADMIN_ID, 
            `💰 **NOUVEL ABONNEMENT**\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Sender: ${text}\n📅 Type: Abonnement 1500Ar`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ Approuver', `approve_sub_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_${userId}`)]])
        );
        await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
        delete userStates[userId];
        return ctx.reply("✅ Nalefa any amin'ny Admin. Miandrasa kely.");
    }

    // --- ROBOT ---
    if (state === 'waiting_robot_sender_num') {
        userStates[userId] = 'waiting_robot_sender_name';
        userStates[userId + '_robot_num'] = text;
        return ctx.reply("Soraty ny **ANARANA** (Nom) amin'ilay laharana nandefa vola:");
    }

    if (state === 'waiting_robot_sender_name') {
        const num = userStates[userId + '_robot_num'];
        const name = text;
        
        await ctx.telegram.sendMessage(ADMIN_ID, 
            `🤖 **ACHAT ROBOT PRO**\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Num: ${num}\n📝 Nom: ${name}\n💰 Montant: 15000 Ar`,
            Markup.inlineKeyboard([[Markup.button.callback('✅ Valider Achat Robot', `approve_robot_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_robot_${userId}`)]])
        );
        delete userStates[userId];
        delete userStates[userId + '_robot_num'];
        return ctx.reply("✅ Voaray. Hamarinina any amin'ny Admin.");
    }

    // --- OLD ACCOUNT ---
    if (state === 'waiting_old_phone') {
        userStates[userId] = 'waiting_old_screenshot';
        userStates[userId + '_phone'] = text; 
        return ctx.reply("Alefaso sary (Capture d'écran) ny compte taloha:");
    }
    
    if (state === 'waiting_old_screenshot') {
        if (ctx.message.photo) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            userStates[userId] = 'waiting_old_note';
            userStates[userId + '_img'] = fileId; 
            return ctx.reply("Soraty ny Note kely mba hanazavana fa efa mpianatra ianao:");
        } else {
             return ctx.reply("❌ Sary ihany no alefaso azafady.");
        }
    }

    if (state === 'waiting_old_note') {
         const oldPhone = userStates[userId + '_phone'];
         const fileId = userStates[userId + '_img'];
         await ctx.telegram.sendPhoto(ADMIN_ID, fileId, {
             caption: `🔄 **Ancien Compte**\n👤 User: ${ctx.from.first_name}\n🆔 ID: ${userId}\n📞 Ancien Num: ${oldPhone}\n🗒️ Note: ${text}`,
             ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approuver', `approve_sub_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_${userId}`)]])
         });
         await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
         delete userStates[userId];
         return ctx.reply("✅ Nalefa any amin'ny Admin.");
    }
});

// ============================================================
// --- APPROBATION LOGIC (CORRIGÉ / NO BUG) ---
// ============================================================

// A. Validation Abonnement (1500 Ar)
bot.action(/approve_sub_(.+)/, async (ctx) => {
    // 1. Valider le click tout de suite pour éviter "Ne répond pas"
    await ctx.answerCbQuery("✅ Traitement en cours...");

    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    const userRef = doc(db, "users", targetId);

    try {
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            return ctx.reply("❌ Erreur: Utilisateur introuvable.");
        }

        // 2. Activer le compte
        await updateDoc(userRef, { 
            status: 'approved',
            approvedAt: new Date().toISOString()
        });

        // 3. Gestion Parrainage (Securisé avec Try/Catch)
        // Raha misy erreur ato dia tsy manakana ny validation
        try {
            const userData = userSnap.data();
            if (userData.referredBy) {
                const referrerRef = doc(db, "users", userData.referredBy);
                // Utilisation increment Firestore
                await updateDoc(referrerRef, { 
                    referralCount: increment(1) 
                });

                // Verification 10 personnes
                const referrerSnap = await getDoc(referrerRef);
                if (referrerSnap.exists()) {
                    const rData = referrerSnap.data();
                    if (rData.referralCount >= 10 && !rData.robotAccess) {
                        await updateDoc(referrerRef, { robotAccess: true });
                        await ctx.telegram.sendMessage(userData.referredBy, "🎉 **BRAVO!**\n\nNahatafiditra olona 10 ianao. Efa misokatra maimaim-poana ho anao izao ny menu **Vente Robot Trading**!");
                    }
                }
            }
        } catch (errParrain) {
            console.error("Erreur Parrainage (tsy maninona):", errParrain);
            // Tsy manao n'inona n'inona, tohizana ny validation
        }

        // 4. Update UI Admin
        try { 
            await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Fanamafisana'}\n\n✅ APPROUVÉ (ABONNEMENT)`); 
        } catch (e) {}

        // 5. Notify User
        await ctx.telegram.sendMessage(targetId, "✅ Arahabaina! Nekena ny kaontinao (Valide 30 jours). Afaka miditra ianao izao.", mainMenu);

    } catch (error) {
        console.error("Erreur Validation:", error);
        ctx.reply("❌ Nisy olana teo amin'ny validation: " + error.message);
    }
});

// B. Validation Robot
bot.action(/approve_robot_(.+)/, async (ctx) => {
    await ctx.answerCbQuery("✅ Traitement..."); // Valider click
    
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    
    try {
        await updateDoc(doc(db, "users", targetId), { robotAccess: true });
        
        try { await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Fanamafisana'}\n\n✅ APPROUVÉ (ROBOT)`); } catch (e) {}
        
        await ctx.telegram.sendMessage(targetId, "🎉 **FANDRESENA!**\n\nVoaray ny vola 15,000Ar. Misokatra izao ny section Robot Pro.");
        await ctx.telegram.sendMessage(targetId, "Tsindrio ny bokotra **💎 Vente Robot PRO** eo amin'ny Menu mba hakana ireo Robot-nao.", mainMenu);
    } catch (e) {
        ctx.reply("Erreur Robot: " + e.message);
    }
});

// C. Rejet
bot.action(/reject_(.+)/, async (ctx) => {
    await ctx.answerCbQuery("❌ Refusé");
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    await updateDoc(doc(db, "users", targetId), { status: 'rejected' });
    try { await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Confirmation'}\n\n❌ REFUSÉ`); } catch (e) {}
    await ctx.telegram.sendMessage(targetId, "❌ Nanda ny fandoavanao ny Admin. Hamarino ny laharana na ny vola.");
});

bot.action(/reject_robot_(.+)/, async (ctx) => {
    await ctx.answerCbQuery("❌ Refusé");
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    try { await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Confirmation'}\n\n❌ REFUSÉ (ROBOT)`); } catch (e) {}
    await ctx.telegram.sendMessage(targetId, "❌ Nolavina ny fividianana Robot. Mifandraisa amin'ny Admin.");
});

// --- LIEN PARRAINAGE ---
bot.action('my_referral', async (ctx) => {
    const userId = ctx.from.id;
    const userSnap = await getDoc(doc(db, "users", userId.toString()));
    const count = userSnap.exists() ? (userSnap.data().referralCount || 0) : 0;
    const botUser = await ctx.telegram.getMe();
    const link = `https://t.me/${botUser.username}?start=${userId}`;
    
    const msg = `
🔗 **LIEN DE PARRAINAGE**

Asao ny namanao hampiasa ity bot ity.
Rehefa mahazo olona **10** nandoa vola ianao, dia hahazo ny **ROBOT TRADING PRO (Prix: 15000Ar)** maimaim-poana!

👥 Isan'ny olona nampidirinao: **${count}/10**

👇 **Ity ny lien-nao:**
\`${link}\`
    `;
    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard([[backButton]]));
});

// --- LISTE ROBOTS ---
async function showRobotContent(ctx) {
    const q = query(collection(db, "formations"), where("category", "==", "robot_pro"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return ctx.reply("🤖 **ESPACE ROBOT PRO**\n\nMbola tsy nampiditra Robot ny Admin. Miandrasa kely azafady.", Markup.inlineKeyboard([[backButton]]));
    }

    await ctx.reply("💎 **LISTE DES ROBOTS PRO**\n\nMisafidiana ary ampiasao amim-pahendrena (1/jour).");
    
    for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        let buttons = [];
        if (d.downloadLink) buttons.push(Markup.button.url('📥 Télécharger', d.downloadLink));
        
        await ctx.replyWithMarkdown(`🤖 **${d.title}**\n\n${d.description || ''}`, Markup.inlineKeyboard([buttons]));
        await new Promise(r => setTimeout(r, 300));
    }
    await ctx.reply("---", Markup.inlineKeyboard([[backButton]]));
}


// --- ADMIN PANEL ---
function sendAdminPanel(ctx) {
    ctx.reply("🔧 **ADMINISTRATION**", Markup.inlineKeyboard([
        [Markup.button.callback('➕ Ajouter Contenu', 'admin_add_start')],
        [Markup.button.callback('📚 Historique & Gestion', 'admin_history')],
        [Markup.button.callback('🏠 Mode Utilisateur', 'admin_home')]
    ]));
}

bot.action('admin_home', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.answerCbQuery();
    await ctx.reply("👋 Tongasoa Admin! Ity ny Accueil / Menu Principal :", mainMenu);
});

bot.action('admin_add_start', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    for (var member in tempFormation) delete tempFormation[member];
    userStates[ADMIN_ID] = 'admin_add_title';
    ctx.reply("1️⃣ Ampidiro ny **TITRE**:");
});

const cats = ['microtache', 'poppo', 'trading', 'crypto', 'invest', 'robot_pro']; 
bot.action(/^setcat_(.+)$/, (ctx) => { 
    const c = ctx.match[1];
    tempFormation.category = c;
    userStates[ADMIN_ID] = 'admin_add_link_dl';
    const label = c === 'robot_pro' ? "ROBOT PRO (Payant)" : c.toUpperCase();
    ctx.reply(`Section: ${label}\n\n4️⃣ Alefaso ny **FICHIER** na **LIEN** (Direct or Drive):`);
});

async function handleAdminInput(ctx, state) {
    const text = ctx.message.text;

    if (state === 'admin_add_title') {
        tempFormation.title = text;
        userStates[ADMIN_ID] = 'admin_add_type';
        ctx.reply("2️⃣ Karazana (Video, PDF, Robot...)?");
    
    } else if (state === 'admin_add_type') {
        tempFormation.type = text;
        ctx.reply("3️⃣ Safidio ny Section:", Markup.inlineKeyboard([
            [Markup.button.callback('Microtache', 'setcat_microtache'), Markup.button.callback('Poppo Live', 'setcat_poppo')],
            [Markup.button.callback('Trading Bot (Gratuit)', 'setcat_trading'), Markup.button.callback('Criptomonie', 'setcat_crypto')],
            [Markup.button.callback('Investissement', 'setcat_invest')],
            [Markup.button.callback('💎 ROBOT PRO (Vente)', 'setcat_robot_pro')] 
        ]));
        delete userStates[ADMIN_ID];
    
    } else if (state === 'admin_add_link_dl') {
        if (ctx.message.document) {
            tempFormation.fileId = ctx.message.document.file_id; tempFormation.method = 'file'; tempFormation.mime = 'doc';
            await ctx.reply(`✅ Document voaray.`);
        } else if (ctx.message.video) {
            tempFormation.fileId = ctx.message.video.file_id; tempFormation.method = 'file'; tempFormation.mime = 'video';
            await ctx.reply(`✅ Video voaray.`);
        } else if (ctx.message.audio) {
            tempFormation.fileId = ctx.message.audio.file_id; tempFormation.method = 'file'; tempFormation.mime = 'audio';
            await ctx.reply(`✅ Audio voaray.`);
        } else if (ctx.message.photo) {
             tempFormation.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id; tempFormation.method = 'file'; tempFormation.mime = 'photo';
             await ctx.reply(`✅ Sary voaray.`);
        } else if (text) {
            tempFormation.downloadLink = text; tempFormation.method = 'link';
            await ctx.reply(`✅ Lien voaray.`);
        } else {
            return ctx.reply("❌ Format tsy mety.");
        }

        userStates[ADMIN_ID] = 'admin_add_link_sign';
        ctx.reply("5️⃣ Lien inscription (soraty 'non' raha tsy misy):");
    
    } else if (state === 'admin_add_link_sign') {
        tempFormation.signupLink = text === 'non' ? null : text;
        userStates[ADMIN_ID] = 'admin_add_desc';
        ctx.reply("6️⃣ Description:");
    
    } else if (state === 'admin_add_desc') {
        tempFormation.description = text;
        await addDoc(collection(db, "formations"), tempFormation);
        ctx.reply(`✅ **Voatahiry!**\nCatégorie: ${tempFormation.category}`,
            Markup.inlineKeyboard([
                [Markup.button.callback('➕ Ajouter autre', 'admin_add_start')],
                [Markup.button.callback('🏠 Panel', 'admin_panel_back')]
            ])
        );
        delete userStates[ADMIN_ID];
    
    } else if (state === 'admin_edit_title') {
        const id = editingState.id;
        await updateDoc(doc(db, "formations", id), { title: text });
        await ctx.reply("✅ Titre modifié!");
        delete userStates[ADMIN_ID];
        showHistorique(ctx);
    } else if (state === 'admin_edit_desc') {
        const id = editingState.id;
        await updateDoc(doc(db, "formations", id), { description: text });
        await ctx.reply("✅ Description modifiée!");
        delete userStates[ADMIN_ID];
        showHistorique(ctx);
    }
}

bot.action('admin_history', (ctx) => showHistorique(ctx));
bot.action('admin_panel_back', (ctx) => sendAdminPanel(ctx));

async function showHistorique(ctx) {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const q = collection(db, "formations");
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return ctx.reply("📭 Vide.", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Retour', 'admin_panel_back')]]));
    
    await ctx.reply("📚 **LISTE COMPLETE**");
    querySnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        ctx.replyWithMarkdown(`📌 **${d.title}**\n📂 ${d.category}`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Titre', `edit_title_${docSnap.id}`), Markup.button.callback('✏️ Desc', `edit_desc_${docSnap.id}`)],
                [Markup.button.callback('🗑️ SUPPRIMER', `delete_${docSnap.id}`)]
            ])
        );
    });
}
bot.action(/edit_title_(.+)/, async (ctx) => { editingState.id = ctx.match[1]; userStates[ADMIN_ID] = 'admin_edit_title'; ctx.reply("Nouveau Titre?"); });
bot.action(/edit_desc_(.+)/, async (ctx) => { editingState.id = ctx.match[1]; userStates[ADMIN_ID] = 'admin_edit_desc'; ctx.reply("Nouvelle Description?"); });
bot.action(/delete_(.+)/, async (ctx) => { await deleteDoc(doc(db, "formations", ctx.match[1])); ctx.answerCbQuery('Supprimé'); ctx.editMessageText('🗑️ Effacé.'); });

// --- DISPLAY CONTENT ---
cats.forEach(cat => {
    if (cat === 'robot_pro') return; 

    bot.action(`cat_${cat}`, async (ctx) => {
        const userRef = doc(db, "users", ctx.from.id.toString());
        const userSnap = await getDoc(userRef);
        
        if (ctx.from.id.toString() !== ADMIN_ID) {
            if (!userSnap.exists() || userSnap.data().status !== 'approved') return ctx.answerCbQuery("⛔ Tsy mahazo miditra.");
            if (isExpired(userSnap.data().approvedAt)) return showPaymentPage(ctx, true);
        }

        await ctx.answerCbQuery();
        await ctx.reply(`📂 **Section: ${cat.toUpperCase()}**\n\nmitady... ⏳`);
        
        const q = query(collection(db, "formations"), where("category", "==", cat));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) return ctx.reply("⚠️ Mbola tsy misy.", Markup.inlineKeyboard([[backButton]]));

        for (const formationDoc of querySnapshot.docs) {
            const data = formationDoc.data();
            try {
                const buttonsRow = [];
                if (data.signupLink && data.signupLink.startsWith('http')) buttonsRow.push(Markup.button.url('✍️ S\'inscrire', data.signupLink));
                
                if (data.method === 'file' && data.fileId) {
                    let caption = `🎓 **${data.title}**\n📝 ${data.description}`;
                    if (data.mime === 'video') await ctx.replyWithVideo(data.fileId, { caption, parse_mode: 'Markdown' });
                    else if (data.mime === 'audio') await ctx.replyWithAudio(data.fileId, { caption, parse_mode: 'Markdown' });
                    else if (data.mime === 'photo') await ctx.replyWithPhoto(data.fileId, { caption, parse_mode: 'Markdown' });
                    else await ctx.replyWithDocument(data.fileId, { caption, parse_mode: 'Markdown' });

                    if(buttonsRow.length > 0) await ctx.reply("👇", Markup.inlineKeyboard([buttonsRow]));
                } else {
                    if (data.downloadLink && data.downloadLink.startsWith('http')) buttonsRow.push(Markup.button.url('📥 Voir / Télécharger', data.downloadLink));
                    await ctx.replyWithMarkdown(`🎓 **${data.title}**\n\n📝 ${data.description}\n\n📂 Type: ${data.type}`, Markup.inlineKeyboard([buttonsRow]));
                }
            } catch (e) { console.error("Error sending item", e); }
            await new Promise(r => setTimeout(r, 500));
        }
        await ctx.reply("----------------", Markup.inlineKeyboard([[backButton]]));
    });
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
