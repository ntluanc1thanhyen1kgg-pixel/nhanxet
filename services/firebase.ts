import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    User
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    query, 
    where, 
    updateDoc, 
    deleteDoc,
    orderBy,
    writeBatch
} from 'firebase/firestore';

const firebaseConfig = {
  projectId: "gen-lang-client-0225020686",
  appId: "1:556197316309:web:505dca2de57e36221d845c",
  apiKey: "AIzaSyABXyh3TfDbTWTim2IU0eTpy0vQDi5it8Y",
  authDomain: "gen-lang-client-0225020686.firebaseapp.com",
  storageBucket: "gen-lang-client-0225020686.firebasestorage.app",
  messagingSenderId: "556197316309",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Special Admin Login Helper
// Maps "admin" / "admin123" to a valid Firebase Auth account
export const loginAsAdmin = async () => {
    const adminEmail = "admin@app.local";
    const adminPassword = "admin123";
    
    try {
        const userCredential = await signInWithEmailAndPassword(auth, adminEmail, adminPassword);
        return userCredential.user;
    } catch (error: any) {
        // If user doesn't exist, create it (this is a one-time thing for this specific request)
        if (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            try {
                const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, adminPassword);
                // Also set role in firestore
                await setDoc(doc(db, 'users', userCredential.user.uid), {
                    email: adminEmail,
                    role: 'admin'
                });
                return userCredential.user;
            } catch (createError) {
                console.error("Failed to create admin user", createError);
                throw createError;
            }
        }
        throw error;
    }
};

// Firestore Helpers for the app
export const firebaseStorage = {
    // Classes
    async saveClass(className: string, data: any) {
        // Firestore doesn't support nested arrays (2D arrays like rawExcelData)
        // We stringify these fields to store them safely
        const safeData = {
            ...data,
            rawExcelData: data.rawExcelData ? JSON.stringify(data.rawExcelData) : null,
            rawExcelMerges: data.rawExcelMerges ? JSON.stringify(data.rawExcelMerges) : null,
            lastModified: Date.now()
        };
        await setDoc(doc(db, 'classes', className), safeData);
    },

    async getAllClasses() {
        const q = query(collection(db, 'classes'), orderBy('lastModified', 'desc'));
        const querySnapshot = await getDocs(q);
        const classes: Record<string, any> = {};
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            // Parse back the stringified fields
            classes[doc.id] = {
                ...data,
                rawExcelData: data.rawExcelData ? JSON.parse(data.rawExcelData) : [],
                rawExcelMerges: data.rawExcelMerges ? JSON.parse(data.rawExcelMerges) : []
            };
        });
        return classes;
    },

    async deleteClass(className: string) {
        await deleteDoc(doc(db, 'classes', className));
    },

    // Templates
    async saveTemplates(templates: any[]) {
        // We can't easily sync a whole array to separate docs without complexity
        // For simplicity, we'll store groups of templates
        const batch = writeBatch(db);
        for (const t of templates) {
            const id = `${t.gradeLevel}_${t.subject}_${t.range}`.replace(/\//g, '_');
            const ref = doc(db, 'templates', id);
            batch.set(ref, t);
        }
        await batch.commit();
    },

    async getAllTemplates() {
        const querySnapshot = await getDocs(collection(db, 'templates'));
        const templates: any[] = [];
        querySnapshot.forEach((doc) => {
            templates.push(doc.data());
        });
        return templates;
    },

    // NLPC Templates
    async saveNLPC(templates: any[]) {
        const batch = writeBatch(db);
        for (const t of templates) {
            const id = `${t.gradeLevel}_${t.category}_${t.level}`.replace(/\//g, '_');
            const ref = doc(db, 'nlpc_templates', id);
            batch.set(ref, t);
        }
        await batch.commit();
    },

    async getAllNLPC() {
        const querySnapshot = await getDocs(collection(db, 'nlpc_templates'));
        const templates: any[] = [];
        querySnapshot.forEach((doc) => {
            templates.push(doc.data());
        });
        return templates;
    },

    // Settings
    async saveSettings(userId: string, settings: any) {
        await setDoc(doc(db, 'settings', userId), {
            ...settings,
            userId
        });
    },

    async getSettings(userId: string) {
        const docRef = doc(db, 'settings', userId);
        const docSnap = await getDoc(docRef);
        return docSnap.exists() ? docSnap.data() : null;
    }
};
