/* ============================================================
   FIREBASE CONFIGURATION & DATA MODELS
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, getDoc, addDoc,
  updateDoc, setDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const firebaseConfig = {
  apiKey: "AIzaSyBoWL8IYlrHITAr7fFZ1cOXBOXhgqi9Y3I",
  authDomain: "myproject-59bb6.firebaseapp.com",
  projectId: "myproject-59bb6",
  storageBucket: "myproject-59bb6.firebasestorage.app",
  messagingSenderId: "326089693114",
  appId: "1:326089693114:web:7e849d1447e9abf4a36f83"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

/* ── Collection names ── */
export const COLLECTIONS = {
  PROJECTS:    'projects',
  CATEGORIES:  'categories',
  SITE_CONFIG: 'site_config',
};

/* ============================================================
   DATA MODELS (documentation)

   CATEGORY:
   {
     id: string (auto),
     name: string,
     slug: string,
     description: string,
     icon: string,
     color: string (hex),
     order: number,
     projectCount: number,
     createdAt: Timestamp,
     updatedAt: Timestamp,
   }

   PROJECT:
   {
     id: string (auto),
     title: string,
     slug: string,
     description: string,           // short summary
     longDescription: string,       // full detail
     categoryId: string,
     categoryName: string,
     tags: string[],
     status: 'published'|'draft'|'archived',
     featured: boolean,
     featuredOrder: number,         // for ordering featured cards
     coverImage: string,            // Cloudinary secure_url
     gallery: string[],             // array of Cloudinary secure_urls
     links: { label: string, url: string }[],
     date: string,                  // ISO date
     journey: JourneySection[],
     viewCount: number,
     createdAt: Timestamp,
     updatedAt: Timestamp,
   }

   JOURNEY SECTION:
   {
     id: string,
     title: string,
     description: string,
     image: string,                 // Cloudinary secure_url or ''
     gallery: string[],             // Cloudinary secure_urls
     order: number,
   }

   SITE_CONFIG (doc id: 'main'):
   {
     ownerName: string,
     ownerTitle: string,
     ownerBio: string,
     ownerPhoto: string,            // Cloudinary secure_url
     ownerEmail: string,
     socialLinks: { platform: string, url: string }[],
     heroTagline: string,
     heroSubtext: string,
     updatedAt: Timestamp,
   }
   ============================================================ */

/* ============================================================
   AUTH
   ============================================================ */
export async function login(email, password) {
  await setPersistence(auth, browserLocalPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

export function onAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function currentUser() {
  return auth.currentUser;
}

/* ============================================================
   SITE CONFIG
   ============================================================ */
export async function getSiteConfig() {
  const snap = await getDoc(doc(db, COLLECTIONS.SITE_CONFIG, 'main'));
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  return null;
}

export async function saveSiteConfig(data) {
  await setDoc(doc(db, COLLECTIONS.SITE_CONFIG, 'main'), {
    ...data,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function initSiteConfig(data) {
  const ref = doc(db, COLLECTIONS.SITE_CONFIG, 'main');
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { ...data, updatedAt: serverTimestamp() });
  }
}

/* ============================================================
   CATEGORIES
   ============================================================ */
export async function getCategories() {
  const q = query(collection(db, COLLECTIONS.CATEGORIES), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createCategory(data) {
  return addDoc(collection(db, COLLECTIONS.CATEGORIES), {
    ...data,
    projectCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCategory(id, data) {
  return updateDoc(doc(db, COLLECTIONS.CATEGORIES, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCategory(id) {
  return deleteDoc(doc(db, COLLECTIONS.CATEGORIES, id));
}

/* ============================================================
   PROJECTS
   ============================================================ */
export async function getProjects({ categoryId, status, featuredOnly, limitCount } = {}) {
  let constraints = [];
  if (status)       constraints.push(where('status', '==', status));
  if (categoryId)   constraints.push(where('categoryId', '==', categoryId));
  if (featuredOnly) constraints.push(where('featured', '==', true));
  constraints.push(orderBy('date', 'desc'));
  if (limitCount)   constraints.push(limit(limitCount));

  const q = query(collection(db, COLLECTIONS.PROJECTS), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getProject(id) {
  const snap = await getDoc(doc(db, COLLECTIONS.PROJECTS, id));
  if (snap.exists()) return { id: snap.id, ...snap.data() };
  return null;
}

export async function createProject(data) {
  return addDoc(collection(db, COLLECTIONS.PROJECTS), {
    ...data,
    viewCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Create many projects sharing the same base data, each with a different coverImage.
 * Uses a single Firestore batch write (max 500 ops per batch).
 *
 * @param {object}   baseData    - shared fields (title, categoryId, categoryName, status, tags, ...)
 * @param {string[]} coverImages - one Cloudinary secure_url per project
 * @returns {Promise<string[]>}  - created document IDs, in the same order as coverImages
 */
export async function createProjectsBatch(baseData, coverImages) {
  const CHUNK_SIZE = 500;
  const ids = [];

  for (let start = 0; start < coverImages.length; start += CHUNK_SIZE) {
    const chunk = coverImages.slice(start, start + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach(coverImage => {
      const ref = doc(collection(db, COLLECTIONS.PROJECTS));
      batch.set(ref, {
        ...baseData,
        coverImage,
        slug: generateSlug(`${baseData.title}-${ref.id}`),
        viewCount: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      ids.push(ref.id);
    });

    await batch.commit();
  }

  return ids;
}

export async function updateProject(id, data) {
  return updateDoc(doc(db, COLLECTIONS.PROJECTS, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteProject(id) {
  return deleteDoc(doc(db, COLLECTIONS.PROJECTS, id));
}

export async function incrementViewCount(id) {
  return updateDoc(doc(db, COLLECTIONS.PROJECTS, id), {
    viewCount: increment(1),
  });
}

export async function getFeaturedProjects() {
  const q = query(
    collection(db, COLLECTIONS.PROJECTS),
    where('featured', '==', true),
    where('status', '==', 'published'),
    orderBy('featuredOrder', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/* ── Live listener for real-time updates ── */
export function onProjectsChange(callback) {
  const q = query(
    collection(db, COLLECTIONS.PROJECTS),
    where('status', '==', 'published'),
    orderBy('date', 'desc')
  );
  return onSnapshot(q, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

/* ============================================================
   IMAGE UTILITIES
   Images are now uploaded to Cloudinary; only secure_urls are
   stored in Firestore. See js/cloudinary.js for upload logic.
   ============================================================ */

export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export { db, auth };
