// FLIPNOTE v7.2 — Official NCERT & PYQ Hub + Personal Offline PDF Book Locker
// 100% Legal: Links directly to official NCERT/CBSE/NTA portals + stores user's own PDFs privately in IndexedDB.

import { uid } from './utils.js';

export const OFFICIAL_PORTALS = [
  {
    id: 'ncert-main',
    title: 'NCERT Official Textbooks (Class 1–12)',
    badge: 'Official Govt',
    desc: 'Download any NCERT textbook chapter PDF in English, Hindi, or Urdu directly from NCERT.',
    url: 'https://ncert.nic.in/textbook.php'
  },
  {
    id: 'cbse-10-sqp',
    title: 'CBSE Class 10 Sample Papers & Marking Scheme (2026–27)',
    badge: 'Class 10 Board',
    desc: 'Latest official CBSE Class X SQP and official marking scheme PDFs.',
    url: 'https://cbseacademic.nic.in/sqp_classx_2026-27.html'
  },
  {
    id: 'cbse-12-sqp',
    title: 'CBSE Class 12 Sample Papers & Marking Scheme (2026–27)',
    badge: 'Class 12 Board',
    desc: 'Latest official CBSE Class XII SQP and official marking scheme PDFs.',
    url: 'https://cbseacademic.nic.in/SQP_CLASSXii_2026-27.html'
  },
  {
    id: 'cbse-archive',
    title: 'CBSE Previous Year Sample Paper Archive',
    badge: 'PYQ Archive',
    desc: 'Multi-year official CBSE Sample Question Papers for Class X & XII.',
    url: 'https://cbseacademic.nic.in/sqp_archive.html'
  },
  {
    id: 'nta-mock',
    title: 'NTA Official Mock Test & Exam Portal (JEE / NEET)',
    badge: 'NTA Official',
    desc: 'Official National Testing Agency practice & exam portal.',
    url: 'https://nta.ac.in/Student'
  }
];

function buildChapters(bookCode, names) {
  return names.map((name, idx) => {
    const num = String(idx + 1).padStart(2, '0');
    return {
      chapterNo: idx + 1,
      title: name,
      pdfUrl: `https://ncert.nic.in/textbook/pdf/${bookCode}${num}.pdf`,
      portalUrl: 'https://ncert.nic.in/textbook.php'
    };
  });
}

export const NCERT_CATALOG = {
  'Class 10': {
    Science: buildChapters('jesc1', [
      'Chemical Reactions and Equations',
      'Acids, Bases and Salts',
      'Metals and Non-metals',
      'Carbon and its Compounds',
      'Life Processes',
      'Control and Coordination',
      'How do Organisms Reproduce?',
      'Heredity',
      'Light — Reflection and Refraction',
      'The Human Eye and the Colourful World',
      'Electricity',
      'Magnetic Effects of Electric Current',
      'Our Environment'
    ]),
    Mathematics: buildChapters('jemh1', [
      'Real Numbers',
      'Polynomials',
      'Pair of Linear Equations in Two Variables',
      'Quadratic Equations',
      'Arithmetic Progressions',
      'Triangles',
      'Coordinate Geometry',
      'Introduction to Trigonometry',
      'Some Applications of Trigonometry',
      'Circles',
      'Areas Related to Circles',
      'Surface Areas and Volumes',
      'Statistics',
      'Probability'
    ])
  },
  'Class 12': {
    'Physics Part 1': buildChapters('leph1', [
      'Electric Charges and Fields',
      'Electrostatic Potential and Capacitance',
      'Current Electricity',
      'Moving Charges and Magnetism',
      'Magnetism and Matter',
      'Electromagnetic Induction',
      'Alternating Current',
      'Electromagnetic Waves'
    ]),
    'Physics Part 2': buildChapters('leph2', [
      'Ray Optics and Optical Instruments',
      'Wave Optics',
      'Dual Nature of Radiation and Matter',
      'Atoms',
      'Nuclei',
      'Semiconductor Electronics'
    ]),
    'Chemistry Part 1': buildChapters('lech1', [
      'Solutions',
      'Electrochemistry',
      'Chemical Kinetics',
      'The d- and f-Block Elements',
      'Coordination Compounds'
    ]),
    'Chemistry Part 2': buildChapters('lech2', [
      'Haloalkanes and Haloarenes',
      'Alcohols, Phenols and Ethers',
      'Aldehydes, Ketones and Carboxylic Acids',
      'Amines',
      'Biomolecules'
    ]),
    'Mathematics Part 1': buildChapters('lemh1', [
      'Relations and Functions',
      'Inverse Trigonometric Functions',
      'Matrices',
      'Determinants',
      'Continuity and Differentiability',
      'Application of Derivatives'
    ]),
    'Mathematics Part 2': buildChapters('lemh2', [
      'Integrals',
      'Application of Integrals',
      'Differential Equations',
      'Vector Algebra',
      'Three Dimensional Geometry',
      'Linear Programming',
      'Probability'
    ]),
    Biology: buildChapters('lebo1', [
      'Sexual Reproduction in Flowering Plants',
      'Human Reproduction',
      'Reproductive Health',
      'Principles of Inheritance and Variation',
      'Molecular Basis of Inheritance',
      'Evolution',
      'Human Health and Disease',
      'Microbes in Human Welfare',
      'Biotechnology: Principles and Processes',
      'Biotechnology and its Applications',
      'Organisms and Populations',
      'Ecosystem',
      'Biodiversity and Conservation'
    ])
  }
};

export const RECOMMENDED_BOOKS = [
  { title: 'Concepts of Physics (Vol 1 & 2)', author: 'H.C. Verma', exam: 'JEE Main & Adv / Class 11–12' },
  { title: 'Mathematics for Class 10 & 12', author: 'R.D. Sharma', exam: 'Board Exams + Foundation' },
  { title: 'NCERT Exemplar Problems', author: 'NCERT (Free Official)', exam: 'Class 10, 12 & JEE' },
  { title: 'Advanced Problems in Organic Chemistry', author: 'M.S. Chouhan', exam: 'JEE Main & Advanced' },
  { title: 'Cengage JEE Maths Series', author: 'G. Tewani', exam: 'JEE Main & Advanced' }
];

// ============================================================================
// PERSONAL OFFLINE PDF BOOK LOCKER (DEDICATED INDEXEDDB STORE)
// ============================================================================

const LOCKER_DB = 'flipnote_pdf_locker_v72';
const LOCKER_STORE = 'pdfs';

function openLockerDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(LOCKER_DB, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(LOCKER_STORE)) {
        db.createObjectStore(LOCKER_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePersonalPdf({ title, subject, fileName, sizeBytes, blob }) {
  const db = await openLockerDB();
  const record = {
    id: uid(),
    title: (title || fileName || 'My Book PDF').trim(),
    subject: (subject || 'General').trim(),
    fileName: fileName || 'document.pdf',
    sizeBytes: Number(sizeBytes) || (blob ? blob.size : 0),
    blob,
    createdAt: Date.now()
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCKER_STORE, 'readwrite');
    tx.objectStore(LOCKER_STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPersonalPdfs() {
  try {
    const db = await openLockerDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LOCKER_STORE, 'readonly');
      const req = tx.objectStore(LOCKER_STORE).getAll();
      req.onsuccess = () => {
        const items = (req.result || []).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        resolve(items);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function deletePersonalPdf(id) {
  const db = await openLockerDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LOCKER_STORE, 'readwrite');
    tx.objectStore(LOCKER_STORE).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
