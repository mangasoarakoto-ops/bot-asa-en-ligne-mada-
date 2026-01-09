const { Telegraf, Markup, session } = require('telegraf');
const express = require('express');

// --- ZAVA-DEHIBE: Hamarino fa ao amin'ny 'firebase.js' dia misy 'export' an'ireo query sy where ireo ---
const { db, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, deleteDoc, query, where } = require('./firebase');

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
const editingState = {}; // Ho an'ny modification

// --- MENU PRINCIPAL & RETOUR ---
const mainMenu = Markup.inlineKeyboard([
    [Markup.button.callback('📂 Microtache', 'cat_microtache'), Markup.button.callback('📹 Poppo Live', 'cat_poppo')],
    [Markup.button.callback('🤖 Trading Bot', 'cat_trading'), Markup.button.callback('💰 Criptomonie', 'cat_crypto')],
    [Markup.button.callback('📈 Investissement', 'cat_invest')],
    [Markup.button.url('💸 Retrait (Echange)', 'https://asaenlignemadaga.is-great.net/echange.html')]
]);

const backButton = Markup.button.callback('🏠 Retour Menu', 'return_home');

// --- ACTION RETOUR ---
bot.action('return_home', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        // Raha admin dia alefa any amin'ny admin panel na main menu
        if (ctx.from.id.toString() === ADMIN_ID) {
             return ctx.editMessageText("👋 Tongasoa eto amin'ny Menu Principal:", mainMenu);
        }
        await ctx.editMessageText("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    } catch (e) {
        // Raha tsisy message ho editena dia mandefa vaovao
        await ctx.reply("👋 Tongasoa eto amin'ny Asa En Ligne Mada!", mainMenu);
    }
});

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
    if(ctx.from.id.toString() === ADMIN_ID) return sendAdminPanel(ctx);
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

// --- INPUT HANDLER (TEXT & FILES) ---
bot.on(['text', 'photo', 'video', 'document', 'audio'], async (ctx) => {
    const userId = ctx.from.id.toString();
    const state = userStates[userId];
    
    // Admin handling
    if (userId === ADMIN_ID) {
        if (state && (state.startsWith('admin_add_') || state.startsWith('admin_edit_'))) {
            return handleAdminInput(ctx, state);
        }
    }

    // Raha tsy text dia mivoaka fa mpampiasa tsotra (afa-tsy sary capture)
    if (!ctx.message.text && state !== 'waiting_old_screenshot') return;

    const text = ctx.message.text;

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
    
    // Sary Capture User
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
             ...Markup.inlineKeyboard([[Markup.button.callback('✅ Approuver', `approve_${userId}`)], [Markup.button.callback('❌ Refuser', `reject_${userId}`)]])
         });
         await updateDoc(doc(db, "users", userId), { status: 'pending_verification' });
         delete userStates[userId];
         return ctx.reply("✅ Nalefa any amin'ny Admin.");
    }
});

// --- ADMIN ACTIONS (APPROVE/REJECT) ---
bot.action(/approve_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    await updateDoc(doc(db, "users", targetId), { status: 'approved' });
    
    // Notification (Popup)
    await ctx.answerCbQuery("✅ Compte Nekena!"); 
    
    // Fanovana ny message Admin
    try {
        await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Fanamafisana'}\n\n✅ TRAITÉ: APPROUVÉ PAR ADMIN`);
    } catch (e) { console.log(e); }

    // Message any amin'ny User
    await ctx.telegram.sendMessage(targetId, "✅ Arahabaina! Nekena ny kaontinao. Afaka miditra ianao izao.", mainMenu);
});

bot.action(/reject_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const targetId = ctx.match[1];
    await updateDoc(doc(db, "users", targetId), { status: 'rejected' });
    
    // Notification (Popup)
    await ctx.answerCbQuery("❌ Compte Nolavina!");

    // Fanovana ny message Admin
    try {
        await ctx.editMessageCaption(`${ctx.callbackQuery.message.caption || 'Fanamafisana'}\n\n❌ TRAITÉ: REFUSÉ PAR ADMIN`);
    } catch (e) { console.log(e); }

    await ctx.telegram.sendMessage(targetId, "❌ Nanda ny fandoavanao ny Admin. Mifandraisa amin'ny tompon'andraikitra.");
});

// --- ADMIN PANEL ---
function sendAdminPanel(ctx) {
    ctx.reply("🔧 **ADMINISTRATION**", Markup.inlineKeyboard([
        [Markup.button.callback('➕ Ajouter Formation', 'admin_add_start')],
        [Markup.button.callback('📚 Historique & Gestion', 'admin_history')],
        [Markup.button.callback('🏠 Accueil User Mode', 'admin_home')]
    ]));
}

bot.action('admin_home', async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    await ctx.answerCbQuery();
    await ctx.reply("👋 Tongasoa Admin! Ity ny Accueil / Menu Principal :", mainMenu);
});

// --- ADD FORMATION LOGIC ---
bot.action('admin_add_start', (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    // Reset temp
    for (var member in tempFormation) delete tempFormation[member];
    userStates[ADMIN_ID] = 'admin_add_title';
    ctx.reply("1️⃣ Ampidiro ny **TITRE** ny formation:");
});

const cats = ['microtache', 'poppo', 'trading', 'crypto', 'invest'];
cats.forEach(c => {
    bot.action(`setcat_${c}`, (ctx) => {
        tempFormation.category = c;
        userStates[ADMIN_ID] = 'admin_add_link_dl';
        ctx.reply(`Section voafidy: ${c.toUpperCase()}\n\n4️⃣ **FICHIER na LIEN**\n\n- Alefaso eto ny Fichier (Video, PDF, XML, Audio...)\n- NA soraty ny Lien (Youtube, Drive...)`);
    });
});

async function handleAdminInput(ctx, state) {
    const text = ctx.message.text;

    // --- ADDING NEW ---
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
        delete userStates[ADMIN_ID]; // Pause until callback
    
    } else if (state === 'admin_add_link_dl') {
        // GESTION FICHIER SY LIEN
        if (ctx.message.document) {
            tempFormation.fileId = ctx.message.document.file_id;
            tempFormation.method = 'file';
            tempFormation.mime = 'doc';
            await ctx.reply(`✅ Fichier Document voaray (Compressé: NON).`);
        } else if (ctx.message.video) {
            tempFormation.fileId = ctx.message.video.file_id;
            tempFormation.method = 'file';
            tempFormation.mime = 'video';
            await ctx.reply(`✅ Video voaray (Compressé: OUI par Telegram).`);
        } else if (ctx.message.audio) {
            tempFormation.fileId = ctx.message.audio.file_id;
            tempFormation.method = 'file';
            tempFormation.mime = 'audio';
            await ctx.reply(`✅ Audio voaray.`);
        } else if (ctx.message.photo) {
             tempFormation.fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
             tempFormation.method = 'file';
             tempFormation.mime = 'photo';
             await ctx.reply(`✅ Sary voaray.`);
        } else if (text) {
            tempFormation.downloadLink = text;
            tempFormation.method = 'link';
            await ctx.reply(`✅ Lien voaray.`);
        } else {
            return ctx.reply("❌ Tsy fantatra ny format. Avereno alefa.");
        }

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
            Markup.inlineKeyboard([
                [Markup.button.callback('➕ Ajouter une autre', 'admin_add_start')],
                [Markup.button.callback('🏠 Admin Panel', 'admin_panel_back')]
            ])
        );
        delete userStates[ADMIN_ID];
    
    // --- EDITING ---
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

// --- HISTORIQUE & GESTION ---
bot.action('admin_history', (ctx) => showHistorique(ctx));
bot.action('admin_panel_back', (ctx) => sendAdminPanel(ctx));

async function showHistorique(ctx) {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    
    const q = collection(db, "formations");
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
        return ctx.reply("📭 Mbola tsy misy formation.", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Retour', 'admin_panel_back')]]));
    }

    await ctx.reply("📚 **HISTORIQUE DES FORMATIONS**\n\nMisafidiana iray havaozina na hofafana:");
    
    querySnapshot.forEach((docSnap) => {
        const d = docSnap.data();
        ctx.replyWithMarkdown(`📌 **${d.title}**\n📂 ${d.category} | Type: ${d.type}`, 
            Markup.inlineKeyboard([
                [Markup.button.callback('✏️ Modifier Titre', `edit_title_${docSnap.id}`), Markup.button.callback('✏️ Modif Desc', `edit_desc_${docSnap.id}`)],
                [Markup.button.callback('🗑️ SUPPRIMER', `delete_${docSnap.id}`)]
            ])
        );
    });
    // Add a return button at the very end
    setTimeout(() => {
        ctx.reply("-----", Markup.inlineKeyboard([[Markup.button.callback('⬅️ Retour Admin', 'admin_panel_back')]]));
    }, 1000);
}

// --- EDIT HANDLERS ---
bot.action(/edit_title_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const id = ctx.match[1];
    editingState.id = id;
    userStates[ADMIN_ID] = 'admin_edit_title';
    await ctx.reply(`Soraty ny TITRE vaovao ho an'ity formation ity:`);
    await ctx.answerCbQuery();
});

bot.action(/edit_desc_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) return;
    const id = ctx.match[1];
    editingState.id = id;
    userStates[ADMIN_ID] = 'admin_edit_desc';
    await ctx.reply(`Soraty ny DESCRIPTION vaovao:`);
    await ctx.answerCbQuery();
});

// --- DELETE FORMATION ---
bot.action(/delete_(.+)/, async (ctx) => {
    if (ctx.from.id.toString() !== ADMIN_ID) {
        return ctx.answerCbQuery('Tsy manana fahazoan-dàlana ianao.');
    }
    const formationId = ctx.match[1];
    try {
        await deleteDoc(doc(db, "formations", formationId));
        await ctx.answerCbQuery('✅ Formation voafafa!');
        await ctx.editMessageText(`🗑️ Formation voafafa soa aman-tsara.`);
    } catch (err) {
        console.error('Delete error:', err);
        await ctx.answerCbQuery('❌ Nisy olana.');
    }
});

// --- USER VIEW CONTENT (Vao nahitsy sy nasiana Sécurité) ---
cats.forEach(cat => {
    bot.action(`cat_${cat}`, async (ctx) => {
        try {
            // 0. Debug Check (Hamarino ao amin'ny terminal)
            if (!query || !where) {
                console.error("⛔ ERREUR IMPORT: 'query' na 'where' dia undefined. Hamarino ny firebase.js anao.");
                return ctx.reply("⚠️ Misy olana teknika ao amin'ny Server (Import Error).");
            }

            // 1. Verification User
            const userRef = doc(db, "users", ctx.from.id.toString());
            const userSnap = await getDoc(userRef);
            
            if (ctx.from.id.toString() !== ADMIN_ID && (!userSnap.exists() || userSnap.data().status !== 'approved')) {
                await ctx.answerCbQuery("⛔ Tsy mahazo miditra eto ianao.");
                return;
            }

            await ctx.answerCbQuery();
            await ctx.reply(`📂 **Section: ${cat.toUpperCase()}**\n\nmitady... ⏳`);
            
            // 2. QUERY OPTIMISÉ
            const q = query(
                collection(db, "formations"), 
                where("category", "==", cat)
            );
            
            const querySnapshot = await getDocs(q);
            
            if (querySnapshot.empty) {
                return ctx.reply("⚠️ Mbola tsy misy formation ato.", Markup.inlineKeyboard([[backButton]]));
            }

            // 3. BOUCLE ROBUSTE (Tsy mampijanona ny bot raha misy video 1 tsy mety)
            for (const formationDoc of querySnapshot.docs) {
                const data = formationDoc.data();
                
                try {
                    // Manomana ny bokotra
                    const buttonsRow = [];
                    // Validation ny URL mba tsy hi-crash
                    if (data.signupLink && data.signupLink.startsWith('http')) {
                        buttonsRow.push(Markup.button.url('✍️ S\'inscrire', data.signupLink));
                    }
                    
                    // Arakaraka ny karazana fichier (Method)
                    if (data.method === 'file' && data.fileId) {
                        // Raha Fichier mivantana
                        let caption = `🎓 **${data.title}**\n📝 ${data.description}`;
                        
                        // Error handling specifique ho an'ny file send
                        try {
                            if (data.mime === 'video') {
                                await ctx.replyWithVideo(data.fileId, { caption: caption, parse_mode: 'Markdown' });
                            } else if (data.mime === 'audio') {
                                await ctx.replyWithAudio(data.fileId, { caption: caption, parse_mode: 'Markdown' });
                            } else if (data.mime === 'photo') {
                                await ctx.replyWithPhoto(data.fileId, { caption: caption, parse_mode: 'Markdown' });
                            } else {
                                await ctx.replyWithDocument(data.fileId, { caption: caption, parse_mode: 'Markdown' });
                            }
                        } catch (sendErr) {
                            console.error(`⚠️ Tsy lasa ny fichier ${data.title}:`, sendErr.message);
                            // Tohizana ny loop, tsy alefa ity video ity fa ny manaraka alefa
                            continue; 
                        }

                        if(buttonsRow.length > 0) {
                            await ctx.reply("👇", Markup.inlineKeyboard([buttonsRow]));
                        }

                    } else {
                        // Raha LIEN tsotra
                        if (data.downloadLink && data.downloadLink.startsWith('http')) {
                            buttonsRow.push(Markup.button.url('📥 Voir / Télécharger', data.downloadLink));
                        }
                        
                        await ctx.replyWithMarkdown(
                            `🎓 **${data.title}**\n\n📝 ${data.description}\n\n📂 Type: ${data.type}`, 
                            Markup.inlineKeyboard([buttonsRow])
                        );
                    }
                } catch (innerError) {
                    console.error("Erreur kely tamin'ny element iray:", innerError);
                }
                
                // 4. FIATOANA KELY (0.5s)
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 5. Bokotra Retour
            await ctx.reply("----------------", Markup.inlineKeyboard([[backButton]]));

        } catch (error) {
            console.error("❌ ERREUR CRITIQUE QUERY:", error);
            // Eto no ahitanao ny olana raha mbola mitranga (Check console)
            ctx.reply(`❌ Nisy olana teknika: ${error.message}`);
        }
    });
});

bot.launch();
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
