import {
  auth,
  db,
  storage,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  ref,
  uploadBytes,
  getDownloadURL
} from './firebase-config.js';

const authView = document.getElementById('authView');
const dashboardView = document.getElementById('dashboardView');
const logoutBtn = document.getElementById('logoutBtn');
const themeToggle = document.getElementById('themeToggle');
const tabs = document.querySelectorAll('[data-auth-tab]');
const forms = {
  login: document.getElementById('loginForm'),
  register: document.getElementById('registerForm'),
  reset: document.getElementById('resetForm')
};
const toast = document.getElementById('toast');
const itemForm = document.getElementById('itemForm');
const itemTitle = document.getElementById('itemTitle');
const itemDescription = document.getElementById('itemDescription');
const itemImage = document.getElementById('itemImage');
const itemsList = document.getElementById('itemsList');
const emptyState = document.getElementById('emptyState');
const refreshItems = document.getElementById('refreshItems');
const userName = document.getElementById('userName');
const formTitle = document.getElementById('formTitle');
const cancelEditBtn = document.getElementById('cancelEditBtn');

let currentUser = null;
let editId = null;
let items = [];

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 2600);
};

const setTheme = (dark) => {
  document.body.classList.toggle('dark', dark);
  themeToggle.textContent = dark ? '🌙' : '☀️';
  localStorage.setItem('theme', dark ? 'dark' : 'light');
};

const toggleAuthView = (showAuth) => {
  authView.classList.toggle('hidden', !showAuth);
  dashboardView.classList.toggle('hidden', showAuth);
  logoutBtn.classList.toggle('hidden', showAuth);
};

const setActiveTab = (tab) => {
  tabs.forEach((button) => button.classList.toggle('active', button.dataset.authTab === tab));
  Object.entries(forms).forEach(([name, form]) => form.classList.toggle('hidden', name !== tab));
};

const handleAuth = async (event, type) => {
  event.preventDefault();
  const email = event.target.querySelector('input[type="email"]').value.trim();
  const password = event.target.querySelector('input[type="password"]').value;

  try {
    if (type === 'login') {
      await signInWithEmailAndPassword(auth, email, password);
      showToast('Sesión iniciada');
    } else if (type === 'register') {
      await createUserWithEmailAndPassword(auth, email, password);
      showToast('Cuenta creada correctamente');
    } else {
      await sendPasswordResetEmail(auth, email);
      showToast('Revisa tu correo para recuperar la contraseña');
    }
  } catch (error) {
    showToast(error.message || 'Ha ocurrido un error');
  }
};

forms.login.addEventListener('submit', (event) => handleAuth(event, 'login'));
forms.register.addEventListener('submit', (event) => handleAuth(event, 'register'));
forms.reset.addEventListener('submit', (event) => handleAuth(event, 'reset'));

tabs.forEach((tab) => tab.addEventListener('click', () => setActiveTab(tab.dataset.authTab)));

logoutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
    showToast('Sesión cerrada');
  } catch (error) {
    showToast(error.message || 'No se pudo cerrar sesión');
  }
});

itemForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!currentUser) return;

  const title = itemTitle.value.trim();
  const description = itemDescription.value.trim();
  const file = itemImage.files[0];

  if (!title || !description) {
    showToast('Completa todos los campos');
    return;
  }

  try {
    let imageUrl = '';
    if (file) {
      const storageRef = ref(storage, `items/${currentUser.uid}/${Date.now()}-${file.name}`);
      const snapshot = await uploadBytes(storageRef, file);
      imageUrl = await getDownloadURL(snapshot.ref);
    }

    const data = {
      title,
      description,
      imageUrl,
      userId: currentUser.uid,
      createdAt: new Date().toISOString()
    };

    if (editId) {
      await updateDoc(doc(db, 'items', editId), data);
      showToast('Registro actualizado');
    } else {
      await addDoc(collection(db, 'items'), data);
      showToast('Registro guardado');
    }

    itemForm.reset();
    editId = null;
    formTitle.textContent = 'Nuevo registro';
    cancelEditBtn.classList.add('hidden');
    await loadItems();
  } catch (error) {
    showToast(error.message || 'No se pudo guardar');
  }
});

cancelEditBtn.addEventListener('click', () => {
  editId = null;
  itemForm.reset();
  formTitle.textContent = 'Nuevo registro';
  cancelEditBtn.classList.add('hidden');
});

refreshItems.addEventListener('click', loadItems);

const renderItems = () => {
  if (!items.length) {
    emptyState.classList.remove('hidden');
    itemsList.innerHTML = '';
    return;
  }

  emptyState.classList.add('hidden');
  itemsList.innerHTML = items.map((item) => `
    <article class="item-card">
      <h4>${item.title}</h4>
      <p>${item.description}</p>
      ${item.imageUrl ? `<img class="item-image" src="${item.imageUrl}" alt="${item.title}" />` : ''}
      <div class="item-actions">
        <button class="ghost-btn" data-edit="${item.id}" type="button">Editar</button>
        <button class="danger-btn" data-delete="${item.id}" type="button">Eliminar</button>
      </div>
    </article>
  `).join('');
};

itemsList.addEventListener('click', async (event) => {
  const editButton = event.target.closest('[data-edit]');
  const deleteButton = event.target.closest('[data-delete]');

  if (editButton) {
    const item = items.find((entry) => entry.id === editButton.dataset.edit);
    if (!item) return;
    editId = item.id;
    itemTitle.value = item.title;
    itemDescription.value = item.description;
    formTitle.textContent = 'Editar registro';
    cancelEditBtn.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (deleteButton) {
    const id = deleteButton.dataset.delete;
    if (!confirm('¿Deseas eliminar este registro?')) return;
    try {
      await deleteDoc(doc(db, 'items', id));
      showToast('Registro eliminado');
      await loadItems();
    } catch (error) {
      showToast(error.message || 'No se pudo eliminar');
    }
  }
});

async function loadItems() {
  if (!currentUser) return;
  const q = query(collection(db, 'items'), where('userId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
  const snapshot = await getDocs(q);
  items = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
  renderItems();
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    userName.textContent = user.email?.split('@')[0] || 'usuario';
    toggleAuthView(false);
    await loadItems();
  } else {
    toggleAuthView(true);
    items = [];
    renderItems();
  }
});

const savedTheme = localStorage.getItem('theme');
setTheme(savedTheme === 'dark');
themeToggle.addEventListener('click', () => setTheme(document.body.classList.contains('dark') ? false : true));
setActiveTab('login');
