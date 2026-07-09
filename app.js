import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    deleteDoc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// DOM Elements — pueden ser null en páginas que no los tienen
const authSection = document.getElementById('auth-section');
const catalogGrid = document.getElementById('catalog-grid');
const addProductBtn = document.getElementById('add-product-btn');
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const modalTitle = document.getElementById('modal-title');

let currentUserRole = 'user';
let currentUser = null;
let unsubscribeProducts = null;
let unsubscribeUser = null;
window.allLoadedProducts = [];

const TARGET_DATE = new Date('May 31, 2026 23:00:00').getTime();

// Inyectar el modal de detalles
const detailModalHTML = `
<div id="product-detail-modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 3000; justify-content: center; align-items: center; padding: 20px; backdrop-filter: blur(10px);">
    <div style="background: #0d0d0d; border-radius: 18px; border: 1px solid rgba(255,255,255,0.05); width: 100%; max-width: 1000px; max-height: 90vh; overflow-y: auto; position: relative; padding: 40px; scrollbar-width: thin;">
        <button onclick="document.getElementById('product-detail-modal').style.display='none'" style="position: absolute; top: 20px; right: 20px; background: none; border: none; color: white; font-size: 30px; cursor: pointer;">&times;</button>
        <div style="display: flex; flex-wrap: wrap; gap: 40px;">
            <div style="flex: 1; min-width: 300px; display: flex; flex-direction: column; gap: 15px;">
                <img id="detail-image" src="" alt="" style="width: 100%; max-height: 500px; border-radius: 12px; object-fit: cover;">
                <div id="detail-image-gallery"></div>
            </div>
            <div style="flex: 1; min-width: 300px; display: flex; flex-direction: column;">
                <div id="detail-category" class="product-category" style="font-size: 14px;"></div>
                <h2 id="detail-title" style="font-size: 32px; margin-bottom: 15px;"></h2>
                <div id="detail-price" class="product-price" style="font-size: 28px; margin-bottom: 15px; color: white;"></div>
                <div style="display: flex; gap: 15px; margin-bottom: 20px;">
                    <div id="detail-stock" style="font-size: 14px; color: #a3a3a3; padding: 5px 15px; background: #222; border-radius: 30px; display: none;"></div>
                </div>
                <div id="detail-sizes-container" style="display: none; margin-bottom: 25px;">
                    <p style="font-size: 14px; color: #8f8f8f; margin-bottom: 10px;">Select Size:</p>
                    <div id="detail-sizes-options" style="display: flex; gap: 10px; flex-wrap: wrap;"></div>
                </div>
                <p id="detail-description" class="product-description" style="max-height: none; font-size: 16px; margin-bottom: 30px; display: block; overflow: visible;"></p>
                <div id="detail-fav-container" style="margin-top: auto;"></div>
            </div>
        </div>
        <div style="margin-top: 50px; border-top: 1px solid #333; padding-top: 30px;">
            <h3 style="margin-bottom: 20px;">Recommendations</h3>
            <div id="detail-recommendations" class="catalog-grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));"></div>
        </div>
    </div>
</div>
`;
document.body.insertAdjacentHTML('beforeend', detailModalHTML);

// ─── Solo conectar el botón si existe en la página ───────────────────────────
if (addProductBtn) {
    addProductBtn.addEventListener('click', () => openModal());
}
if (productForm) {
    productForm.addEventListener('submit', handleProductSubmit);
}

// ─── Evento de Búsqueda ───────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.product-card');

        cards.forEach(card => {
            const title = card.querySelector('.product-title')?.textContent.toLowerCase() || '';
            const desc = card.querySelector('.product-description')?.textContent.toLowerCase() || '';

            if (title.includes(searchTerm) || desc.includes(searchTerm)) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ─── Autenticación ────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    // Cancel suscripción anterior al rol si la hay
    if (unsubscribeUser) {
        unsubscribeUser();
        unsubscribeUser = null;
    }

    if (user) {
        currentUser = user;

        // Escuchar el documento del usuario en Firestore en tiempo real
        console.log("🔍 Buscando documento con UID:", user.uid);
        unsubscribeUser = onSnapshot(
            doc(db, "users", user.uid),
            (userDoc) => {
                let username = user.email.split('@')[0];

                console.log("📄 ¿Documento existe?:", userDoc.exists());
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    console.log("✅ Datos encontrados:", data);
                    currentUserRole = data.role || 'user';
                    if (data.username) username = data.username;

                    // Sync cart and favorites from cloud to local storage
                    if (data.cart) {
                        localStorage.setItem('cart', JSON.stringify(data.cart));
                    } else {
                        localStorage.removeItem('cart');
                    }
                    if (data.favorites) {
                        localStorage.setItem('favorites', JSON.stringify(data.favorites));
                    } else {
                        localStorage.removeItem('favorites');
                    }

                    if (window.updateCartBadge) window.updateCartBadge();
                    if (window.renderCart) window.renderCart();
                } else {
                    console.warn("❌ No se encontró ningún documento con ese UID en /users");
                    currentUserRole = 'user';
                    localStorage.removeItem('cart');
                    localStorage.removeItem('favorites');
                    if (window.updateCartBadge) window.updateCartBadge();
                    if (window.renderCart) window.renderCart();
                }

                updateHeader(username);
                loadProducts();
            },
            (error) => {
                // Si Firestore bloquea la lectura, igual mostramos al usuario
                console.warn("No se pudo leer el rol:", error.code);
                currentUserRole = 'user';
                updateHeader(user.email.split('@')[0]);
                loadProducts();
            }
        );

    } else {
        currentUser = null;
        currentUserRole = 'user';
        localStorage.removeItem('cart');
        localStorage.removeItem('favorites');
        if (window.updateCartBadge) window.updateCartBadge();
        if (window.renderCart) window.renderCart();
        updateHeader(null);
        loadProducts();
    }
});

// ─── Sincronización en la Nube ────────────────────────────────────────────────
window.syncCartToCloud = async () => {
    if (!currentUser) return;
    const cart = JSON.parse(localStorage.getItem('cart')) || [];
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { cart: cart });
    } catch (e) { console.error("Error syncing cart", e); }
};

window.syncFavsToCloud = async () => {
    if (!currentUser) return;
    const favs = JSON.parse(localStorage.getItem('favorites')) || [];
    try {
        await updateDoc(doc(db, "users", currentUser.uid), { favorites: favs });
    } catch (e) { console.error("Error syncing favs", e); }
};

// ─── Actualizar barra superior ────────────────────────────────────────────────
function updateHeader(username) {
    if (!authSection) return;

    const isAdmin = currentUserRole === 'admin';
    const isLogged = !!currentUser;
    const isVaultOpen = new Date().getTime() >= TARGET_DATE;

    if (username) {
        const adminTag = isAdmin ? ' <span style="color:#666;font-size:12px;">(Admin)</span>' : '';
        authSection.innerHTML = `
            <span style="color:#a3a3a3;font-size:14px;">Hello, ${username}${adminTag}</span>
            <button id="logout-btn" style="background:none;border:none;color:white;font-weight:bold;cursor:pointer;font-size:14px;">Log Out</button>
        `;
        document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    } else {
        authSection.innerHTML = `
            <a href="login.html" style="color:white;text-decoration:none;font-weight:bold;font-size:14px;">Log In</a>
        `;
    }

    // Mostrar/ocultar elementos de admin
    if (addProductBtn) {
        addProductBtn.style.display = isAdmin ? 'block' : 'none';
    }
    const adminOnlyElements = document.querySelectorAll('.admin-only');
    adminOnlyElements.forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });

    // Barra de búsqueda y secciones visibles según el estado de registro
    const searchInput = document.getElementById('search-input');
    if (searchInput && searchInput.parentElement && searchInput.parentElement.parentElement) {
        searchInput.parentElement.parentElement.style.visibility = isLogged ? 'visible' : 'hidden';
    }

    const catalogSection = document.getElementById('catalog');
    if (catalogSection) {
        catalogSection.style.display = isLogged ? 'block' : 'none';
    }

    const cartSection = document.querySelector('.cart-section');
    if (cartSection) {
        cartSection.style.display = isLogged ? 'block' : 'none';
    }

    // Habilitar menú desplegable (logo clickable) solo para usuarios registrados
    const logo = document.querySelector('.logo');
    if (logo) {
        const canClickLogo = isLogged;
        logo.style.pointerEvents = canClickLogo ? 'auto' : 'none';
        logo.style.cursor = canClickLogo ? 'pointer' : 'default';
    }

    // Hero section logic
    const heroBtn = document.getElementById('hero-action-btn');
    const heroCountdown = document.getElementById('hero-countdown');

    if (heroBtn && heroCountdown) {
        if (isLogged) {
            heroBtn.style.display = 'none';
            heroCountdown.style.display = 'block';
            if (isVaultOpen) {
                heroCountdown.innerHTML = '<span style="font-size: 24px; font-weight: 800; letter-spacing: 2px;">THE VAULT IS OPEN</span>';
                if (window.countdownInterval) {
                    clearInterval(window.countdownInterval);
                    window.countdownInterval = null;
                }
            } else {
                if (!window.countdownInterval) startCountdown();
            }
        } else {
            heroBtn.style.display = 'inline-block';
            heroBtn.textContent = 'Register to view all content';
            heroBtn.onclick = () => {
                window.location.href = 'register.html';
            };
            heroCountdown.style.display = 'none';
            if (window.countdownInterval) {
                clearInterval(window.countdownInterval);
                window.countdownInterval = null;
            }
        }
    }

    // Actualizar enlaces visibles del sidebar y forzar control de páginas
    updateSidebarVisibility();
    checkPageAccess();
}

function updateSidebarVisibility() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;

    const isAdmin = currentUserRole === 'admin';
    const isLogged = !!currentUser;
    const categories = sidebar.querySelectorAll('.menu-category');

    if (isLogged) {
        sidebar.style.display = 'block';
    } else {
        sidebar.style.display = 'none';
        sidebar.classList.remove('active');
    }

    categories.forEach(cat => {
        // Secciones exclusivas de administración
        if (cat.classList.contains('admin-only')) {
            cat.style.display = isAdmin ? 'block' : 'none';
            return;
        }

        // Si está logueado, ve todo lo demás (barra lateral completa)
        cat.style.display = isLogged ? 'block' : 'none';
    });
}

function checkPageAccess() {
    const isLogged = !!currentUser;
    const isAdmin = currentUserRole === 'admin';
    if (isAdmin) return; // Admin libre acceso

    const path = window.location.pathname;
    const page = path.split('/').pop().toLowerCase();

    // Páginas de administración que los no-administradores NUNCA pueden ver
    const adminPages = [
        'inventory.html',
        'users.html',
        'adminorders.html'
    ];

    if (adminPages.includes(page)) {
        console.warn("Acceso denegado a página de administración para usuario regular:", page);
        window.location.href = 'index.html';
        return;
    }

    // Si no está registrado, las únicas páginas permitidas son index.html, login.html y register.html
    if (!isLogged) {
        const allowedGuestPages = [
            'index.html',
            '',
            'login.html',
            'register.html'
        ];
        if (!allowedGuestPages.includes(page)) {
            console.warn("Acceso denegado a página restringida para usuarios no registrados:", page);
            window.location.href = 'index.html';
        }
    }
}

function startCountdown() {
    const countdownEl = document.getElementById('hero-countdown');
    if (!countdownEl) return;

    const targetDate = TARGET_DATE;

    const updateTimer = () => {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance <= 0) {
            clearInterval(window.countdownInterval);
            window.countdownInterval = null;
            countdownEl.innerHTML = '<span style="font-size: 24px; font-weight: 800; letter-spacing: 2px;">THE VAULT IS OPEN</span>';
            updateHeader(currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : null);
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdownEl.innerHTML = `
            <div style="display: flex; gap: 20px; justify-content: center; text-align: center;">
                <div><span style="font-size: 38px; font-weight: 800;">${days}</span><div style="font-size: 11px; color: #8f8f8f; letter-spacing: 2px; text-transform: uppercase;">Days</div></div>
                <div style="font-size: 38px; font-weight: 800;">:</div>
                <div><span style="font-size: 38px; font-weight: 800;">${hours.toString().padStart(2, '0')}</span><div style="font-size: 11px; color: #8f8f8f; letter-spacing: 2px; text-transform: uppercase;">Hrs</div></div>
                <div style="font-size: 38px; font-weight: 800;">:</div>
                <div><span style="font-size: 38px; font-weight: 800;">${minutes.toString().padStart(2, '0')}</span><div style="font-size: 11px; color: #8f8f8f; letter-spacing: 2px; text-transform: uppercase;">Min</div></div>
                <div style="font-size: 38px; font-weight: 800;">:</div>
                <div><span style="font-size: 38px; font-weight: 800;">${seconds.toString().padStart(2, '0')}</span><div style="font-size: 11px; color: #8f8f8f; letter-spacing: 2px; text-transform: uppercase;">Sec</div></div>
            </div>
        `;
    };

    updateTimer(); // Initial call
    window.countdownInterval = setInterval(updateTimer, 1000);
}

// ─── Productos ────────────────────────────────────────────────────────────────
function loadProducts() {
    if (!catalogGrid) return;

    // Cancel listener anterior para no duplicar
    if (unsubscribeProducts) {
        unsubscribeProducts();
        unsubscribeProducts = null;
    }

    if (!currentUser) {
        catalogGrid.innerHTML = '';
        return;
    }

    const productsRef = collection(db, "products");
    const categoryFilter = catalogGrid.dataset.category || null;
    const featuredOnly = catalogGrid.dataset.featured === 'true';
    const favoritesOnly = catalogGrid.dataset.favorites === 'true';

    unsubscribeProducts = onSnapshot(productsRef, (snapshot) => {
        catalogGrid.innerHTML = '';

        if (snapshot.empty) {
            catalogGrid.innerHTML = '<p style="color:#a3a3a3;">No products available at this moment.</p>';
            return;
        }

        let count = 0;
        let favs = [];
        if (favoritesOnly) {
            favs = JSON.parse(localStorage.getItem('favorites')) || [];
        }

        window.allLoadedProducts = [];

        snapshot.forEach((docSnap) => {
            const product = { id: docSnap.id, ...docSnap.data() };
            window.allLoadedProducts.push(product);

            const matchesCategory = !categoryFilter || product.category.toUpperCase() === categoryFilter.toUpperCase();
            const matchesFeatured = !featuredOnly || product.featured === true;
            const matchesFavorites = !favoritesOnly || favs.includes(product.id);

            // Búsqueda en tiempo real (re-aplicar si hay texto en el input)
            const searchInput = document.getElementById('search-input');
            const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
            const matchesSearch = !searchTerm || product.title.toLowerCase().includes(searchTerm) || (product.description && product.description.toLowerCase().includes(searchTerm));

            if (matchesCategory && matchesFeatured && matchesFavorites && matchesSearch) {
                renderProduct(product, catalogGrid);
                count++;
            }
        });

        if (count === 0) {
            catalogGrid.innerHTML = '<p style="color:#a3a3a3;">No products in this category.</p>';
        }
    }, (error) => {
        console.error("Error al cargar productos:", error);
        catalogGrid.innerHTML = '<p style="color:#ff4d4d;">Error loading products. Check Firestore rules.</p>';
    });
}

function renderProduct(product, container = catalogGrid) {
    const card = document.createElement('div');
    card.className = 'product-card';

    let isFav = false;
    try {
        const favs = JSON.parse(localStorage.getItem('favorites')) || [];
        isFav = favs.includes(product.id);
    } catch (e) { }

    let cardHTML = `
        <div class="product-image">
            <img src="${product.imageUrl}" alt="${product.title}">
            <div class="product-overlay"></div>
        </div>
        <div class="product-info">
            <div class="product-category">${product.category}</div>
            <div class="product-title">${product.title}</div>
            <div class="product-description">${product.description}</div>
            <div class="product-footer">
                <div class="product-price">$${product.price}</div>
                <button class="product-btn fav-btn" data-id="${product.id}" style="${isFav ? 'background: #ff4d4d; color: white; border-color: #ff4d4d;' : ''}">${isFav ? 'Remove Favorite' : 'Favorite'}</button>
            </div>
    `;

    if (currentUserRole === 'admin') {
        cardHTML += `
            <div style="margin-top:15px;display:flex;gap:10px;border-top:1px solid #333;padding-top:15px;">
                <button class="edit-btn" style="flex:1;padding:8px;background:#333;color:white;border:none;border-radius:8px;cursor:pointer;">Edit</button>
                <button class="delete-btn" style="flex:1;padding:8px;background:#ff4d4d;color:white;border:none;border-radius:8px;cursor:pointer;">Delete</button>
            </div>
        `;
    }

    cardHTML += `</div>`;
    card.innerHTML = cardHTML;
    container.appendChild(card);

    // Expand card on click
    card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return; // Ignore if clicking a button
        openProductDetail(product);
    });

    // Add favorites listener
    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }
        let favs = JSON.parse(localStorage.getItem('favorites')) || [];
        const pid = product.id;
        if (favs.includes(pid)) {
            favs = favs.filter(id => id !== pid);
            favBtn.textContent = 'Favorite';
            favBtn.style.background = '';
            favBtn.style.color = '';
            favBtn.style.borderColor = '';
            // If we are on favorites page and in the main catalog, hide the card
            if (catalogGrid && catalogGrid.dataset.favorites === 'true' && container === catalogGrid) {
                card.style.display = 'none';
            }
        } else {
            favs.push(pid);
            favBtn.textContent = 'Remove Favorite';
            favBtn.style.background = '#ff4d4d';
            favBtn.style.color = 'white';
            favBtn.style.borderColor = '#ff4d4d';
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
        if (window.syncFavsToCloud) window.syncFavsToCloud();
    });

    if (currentUserRole === 'admin') {
        const editBtn = card.querySelector('.edit-btn');
        if (editBtn) editBtn.addEventListener('click', () => openModal(product));
        const delBtn = card.querySelector('.delete-btn');
        if (delBtn) delBtn.addEventListener('click', () => deleteProduct(product.id));
    }
}

function openProductDetail(product) {
    document.getElementById('detail-image').src = product.imageUrl;
    document.getElementById('detail-category').textContent = product.category;
    document.getElementById('detail-title').textContent = product.title;
    document.getElementById('detail-price').textContent = `$${product.price}`;
    document.getElementById('detail-description').textContent = product.description;

    // Render the gallery
    const galleryContainer = document.getElementById('detail-image-gallery');
    if (galleryContainer) {
        galleryContainer.innerHTML = '';
        const urls = product.imageUrls && product.imageUrls.length > 0
            ? product.imageUrls
            : (product.imageUrl ? [product.imageUrl] : []);

        if (urls.length > 1) {
            urls.forEach((url, idx) => {
                const img = document.createElement('img');
                img.src = url;
                if (idx === 0) {
                    img.className = 'active';
                }

                img.addEventListener('click', () => {
                    document.getElementById('detail-image').src = url;
                    Array.from(galleryContainer.children).forEach(child => {
                        child.classList.remove('active');
                    });
                    img.className = 'active';
                });

                galleryContainer.appendChild(img);
            });
            galleryContainer.style.display = 'flex';
        } else {
            galleryContainer.style.display = 'none';
        }
    }

    const stockEl = document.getElementById('detail-stock');
    const stockVal = (product.stock !== undefined && product.stock !== null) ? parseInt(product.stock) : 999999;
    if (stockEl) {
        if (product.stock !== undefined && product.stock !== null) {
            stockEl.style.display = 'block';
            if (stockVal <= 0) {
                stockEl.textContent = `Out of Stock`;
                stockEl.style.background = '#ff4d4d';
                stockEl.style.color = 'white';
            } else {
                stockEl.textContent = `Stock: ${stockVal}`;
                stockEl.style.background = '#222';
                stockEl.style.color = '#a3a3a3';
            }
        } else {
            stockEl.style.display = 'none';
        }
    }

    const sizesContainer = document.getElementById('detail-sizes-container');
    const sizesOptions = document.getElementById('detail-sizes-options');
    window.selectedSize = null;

    if (sizesContainer && sizesOptions) {
        let sizesArray = [];
        if (Array.isArray(product.sizes)) {
            sizesArray = product.sizes;
        } else if (typeof product.sizes === 'string') {
            sizesArray = product.sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        }

        if (sizesArray.length > 0) {
            sizesContainer.style.display = 'block';
            sizesOptions.innerHTML = '';
            sizesArray.forEach(size => {
                const btn = document.createElement('button');
                btn.textContent = size;
                btn.style.cssText = 'padding: 8px 16px; background: #222; color: white; border: 1px solid #444; border-radius: 8px; cursor: pointer; transition: 0.2s; font-size: 14px; font-weight: 600;';
                btn.addEventListener('click', () => {
                    Array.from(sizesOptions.children).forEach(child => {
                        child.style.background = '#222';
                        child.style.color = 'white';
                        child.style.borderColor = '#444';
                    });
                    btn.style.background = 'white';
                    btn.style.color = 'black';
                    btn.style.borderColor = 'white';
                    window.selectedSize = size;
                    window.updateCartButtonState(product.id, window.selectedSize);
                });
                sizesOptions.appendChild(btn);
            });
        } else {
            sizesContainer.style.display = 'none';
        }
    }

    const favContainer = document.getElementById('detail-fav-container');
    let isFav = false;
    try {
        const favs = JSON.parse(localStorage.getItem('favorites')) || [];
        isFav = favs.includes(product.id);
    } catch (e) { }

    let isInCart = false;
    let currentQty = 1;
    try {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const found = cart.find(item => item.id === product.id);
        isInCart = !!found;
        if (found) currentQty = found.quantity || 1;
    } catch (e) { }

    if (stockVal <= 0) {
        currentQty = 0;
    } else if (currentQty > stockVal) {
        currentQty = stockVal;
        // Sync modified quantity to localStorage
        try {
            let cart = JSON.parse(localStorage.getItem('cart')) || [];
            const foundIdx = cart.findIndex(item => item.id === product.id);
            if (foundIdx !== -1) {
                cart[foundIdx].quantity = stockVal;
                localStorage.setItem('cart', JSON.stringify(cart));
                if (window.syncCartToCloud) window.syncCartToCloud();
                if (window.updateCartBadge) window.updateCartBadge();
            }
        } catch (e) { }
    }

    window.updateCartButtonState = (pid, size) => {
        const cart = JSON.parse(localStorage.getItem('cart')) || [];
        const cartItemId = pid + (size ? '-' + size : '');
        const found = cart.find(item => (item.cartItemId || item.id) === cartItemId);

        const cartBtn = document.getElementById('detail-cart-btn');
        if (cartBtn) {
            if (stockVal <= 0) {
                cartBtn.textContent = 'Out of Stock';
                cartBtn.style.background = '#555';
                cartBtn.style.color = '#aaa';
                cartBtn.style.cursor = 'not-allowed';
            } else if (found) {
                cartBtn.textContent = '✓ In Cart — View Cart';
                cartBtn.style.background = '#888';
                cartBtn.style.color = 'white';
                cartBtn.style.cursor = 'pointer';
            } else {
                cartBtn.textContent = 'Add to Cart';
                cartBtn.style.background = 'white';
                cartBtn.style.color = 'black';
                cartBtn.style.cursor = 'pointer';
            }
        }

        const qtyEl = document.getElementById('detail-qty');
        if (qtyEl) {
            if (stockVal <= 0) {
                qtyEl.textContent = 0;
            } else if (found) {
                qtyEl.textContent = Math.min(found.quantity || 1, stockVal);
            } else {
                qtyEl.textContent = 1;
            }
        }
    };

    favContainer.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
            <button id="detail-fav-btn" class="product-btn" style="width: 100%; padding: 15px; font-size: 16px; border-radius: 30px; border: 1px solid white; cursor: pointer; transition: .3s; ${isFav ? 'background: #ff4d4d; color: white; border-color: #ff4d4d;' : 'background: transparent; color: white;'}">${isFav ? 'Remove Favorite' : 'Add to Favorites'}</button>
            <div style="display: flex; align-items: center; justify-content: center; gap: 15px; background: #1a1a1a; border: 1px solid #333; border-radius: 30px; padding: 8px 15px;">
                <button onclick="changeQty(-1)" style="background: none; border: none; color: white; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 5px;">−</button>
                <span id="detail-qty" style="font-size: 18px; font-weight: bold; min-width: 24px; text-align: center;">${currentQty}</span>
                <button onclick="changeQty(1)" style="background: none; border: none; color: white; font-size: 22px; cursor: pointer; line-height: 1; padding: 0 5px;">+</button>
            </div>
            <button id="detail-cart-btn" class="product-btn" style="width: 100%; padding: 15px; font-size: 16px; border-radius: 30px; border: none; cursor: pointer; transition: .3s; ${stockVal <= 0 ? 'background: #555; color: #aaa; cursor: not-allowed;' : (isInCart ? 'background: #888; color: white;' : 'background: white; color: black;')}">${stockVal <= 0 ? 'Out of Stock' : (isInCart ? '✓ In Cart — View Cart' : 'Add to Cart')}</button>
        </div>`;

    document.getElementById('detail-fav-btn').addEventListener('click', () => {
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }
        let favs = JSON.parse(localStorage.getItem('favorites')) || [];
        if (favs.includes(product.id)) {
            favs = favs.filter(id => id !== product.id);
        } else {
            favs.push(product.id);
        }
        localStorage.setItem('favorites', JSON.stringify(favs));
        if (window.syncFavsToCloud) window.syncFavsToCloud();
        openProductDetail(product);
        if (window.loadProducts) loadProducts();
    });

    // Expose quantity changer globally
    window.changeQty = (delta) => {
        if (stockVal <= 0) return;
        const qtyEl = document.getElementById('detail-qty');
        if (!qtyEl) return;
        let qty = parseInt(qtyEl.textContent) || 1;

        if (delta > 0 && qty >= stockVal) {
            alert(`Cannot increase quantity. Only ${stockVal} items available in stock.`);
            return;
        }

        qty = Math.max(1, qty + delta);
        qtyEl.textContent = qty;

        // If already in cart, update quantity live
        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const cartItemId = product.id + (window.selectedSize ? '-' + window.selectedSize : '');
        const idx = cart.findIndex(item => (item.cartItemId || item.id) === cartItemId);
        if (idx !== -1) {
            cart[idx].quantity = qty;
            localStorage.setItem('cart', JSON.stringify(cart));
            if (window.syncCartToCloud) window.syncCartToCloud();
            if (window.updateCartBadge) window.updateCartBadge();
        }
    };

    document.getElementById('detail-cart-btn').addEventListener('click', () => {
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        if (stockVal <= 0) {
            alert('This item is currently out of stock.');
            return;
        }

        let sizesArray = [];
        if (product.sizes) {
            if (Array.isArray(product.sizes)) sizesArray = product.sizes;
            else if (typeof product.sizes === 'string') sizesArray = product.sizes.split(',').map(s => s.trim()).filter(s => s !== '');
        }

        if (sizesArray.length > 0 && !window.selectedSize) {
            alert('Please select a size first.');
            return;
        }

        let cart = JSON.parse(localStorage.getItem('cart')) || [];
        const cartItemId = product.id + (window.selectedSize ? '-' + window.selectedSize : '');
        const alreadyIn = cart.some(item => (item.cartItemId || item.id) === cartItemId);

        if (alreadyIn) {
            window.location.href = 'Cart.html';
        } else {
            const qty = parseInt(document.getElementById('detail-qty')?.textContent) || 1;

            if (qty > stockVal) {
                alert(`Cannot add to cart. Only ${stockVal} items available in stock.`);
                return;
            }

            cart.push({
                id: product.id,
                cartItemId: cartItemId,
                title: product.title + (window.selectedSize ? ` - Size: ${window.selectedSize}` : ''),
                price: product.price,
                imageUrl: product.imageUrl,
                category: product.category,
                enabled: true,
                quantity: qty,
                size: window.selectedSize || null,
                stock: stockVal,
                shippingSize: product.shippingSize || 'small'
            });
            localStorage.setItem('cart', JSON.stringify(cart));
            if (window.syncCartToCloud) window.syncCartToCloud();

            window.updateCartButtonState(product.id, window.selectedSize);
            if (window.updateCartBadge) window.updateCartBadge();
        }
    });

    const recommendationsGrid = document.getElementById('detail-recommendations');
    recommendationsGrid.innerHTML = '';

    // Find recommendations
    let recs = window.allLoadedProducts.filter(p => p.category === product.category && p.id !== product.id);
    if (recs.length === 0) {
        recommendationsGrid.innerHTML = '<p style="color:#a3a3a3;">No recommendations available.</p>';
    } else {
        // shuffle and take 4
        recs = recs.sort(() => 0.5 - Math.random()).slice(0, 4);
        recs.forEach(rec => renderProduct(rec, recommendationsGrid));
    }

    const modal = document.getElementById('product-detail-modal');
    modal.style.display = 'flex';
    modal.querySelector('div').scrollTop = 0;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
// Categorys disponibles (coinciden exactamente con el sidebar y con data-category de cada página)
const CATEGORIES = [
    'MEN • HOODIES',
    'MEN • SHIRTS',
    'MEN • PANTS',
    'MEN • SHORTS',
    'MEN • SHOES',
    'WOMEN • HOODIES',
    'WOMEN • SHIRTS',
    'WOMEN • PANTS',
    'WOMEN • SHOES',
    'ACCESSORIES',
    'COLLECTIBLES • POKEMON',
    'COLLECTIBLES • BASEBALL',
    'COLLECTIBLES • BASKETBALL',
    'COLLECTIBLES • FOOTBALL',
    'COLLECTIBLES • SOCCER'
];

function openModal(product = null) {
    if (!productModal || !productForm || !modalTitle) return;

    const isEdit = product !== null;
    modalTitle.textContent = isEdit ? 'Edit Product' : 'Add Product';

    // Reemplazar el campo de categoría por un <select> con todas las opciones
    const catContainer = document.getElementById('prod-category')?.parentElement;
    if (catContainer) {
        const selectedVal = isEdit ? product.category : '';
        catContainer.innerHTML = `
            <label style="display:block;margin-bottom:5px;color:#8f8f8f;font-size:14px;">Category</label>
            <select id="prod-category" required
                style="width:100%;padding:10px;background:#1a1a1a;border:1px solid #333;color:white;border-radius:8px;font-size:14px;appearance:none;cursor:pointer;">
                <option value="" disabled ${!isEdit ? 'selected' : ''}>-- Select a category --</option>
                ${CATEGORIES.map(cat => `<option value="${cat}" ${cat === selectedVal ? 'selected' : ''}>${cat}</option>`).join('')}
            </select>
        `;
    }

    // Inyectar el campo de Shipping Size si no existe ya
    if (!document.getElementById('prod-shipping-size')) {
        const shippingDiv = document.createElement('div');
        shippingDiv.style.cssText = 'margin-bottom: 15px;';
        shippingDiv.innerHTML = `
            <label style="display:block;margin-bottom:5px;color:#8f8f8f;font-size:14px;">Shipping Size</label>
            <select id="prod-shipping-size" required
                style="width:100%;padding:10px;background:#1a1a1a;border:1px solid #333;color:white;border-radius:8px;font-size:14px;appearance:none;cursor:pointer;">
                <option value="free" selected>Free Shipping ($0.00 USD)</option>
                <option value="small">Small ($5.00 USD)</option>
                <option value="medium">Medium ($10.00 USD)</option>
                <option value="large">Large ($20.00 USD)</option>
            </select>
        `;
        if (catContainer && catContainer.nextSibling) {
            catContainer.parentNode.insertBefore(shippingDiv, catContainer.nextSibling);
        } else if (catContainer) {
            catContainer.parentNode.appendChild(shippingDiv);
        }
    }

    // Inject the Cloudinary image upload UI once
    const imgContainer = document.getElementById('prod-image')?.parentElement;
    if (imgContainer && !document.getElementById('img-upload-injected')) {
        imgContainer.innerHTML = `
            <label style="display:block;margin-bottom:5px;color:#8f8f8f;font-size:14px;">Images (Upload or URL)</label>
            <div id="img-upload-injected" style="display:flex;flex-direction:column;gap:10px;">
                <input type="file" id="prod-image-file" accept="image/*"
                    style="width:100%;padding:8px;background:#1a1a1a;border:1px solid #333;color:white;border-radius:8px;">
                <div style="text-align:center;color:#8f8f8f;font-size:12px;">OR</div>
                <div style="display:flex;gap:10px;">
                    <input type="url" id="prod-image-url-input" placeholder="Paste Image URL"
                        style="flex:1;padding:10px;background:#1a1a1a;border:1px solid #333;color:white;border-radius:8px;">
                    <button type="button" id="add-image-btn" style="padding:10px 20px;background:white;color:black;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Add</button>
                </div>
                <div id="images-thumbnail-list" style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;"></div>
                <input type="hidden" id="prod-image" required value="">
            </div>
        `;

        window.adminImagesList = [];

        window.renderAdminImages = () => {
            const list = document.getElementById('images-thumbnail-list');
            if (!list) return;
            list.innerHTML = '';

            window.adminImagesList.forEach((url, idx) => {
                const isPrimary = idx === 0;
                const wrapper = document.createElement('div');
                wrapper.style.cssText = `position:relative;width:80px;height:80px;border-radius:8px;overflow:hidden;border:${isPrimary ? '2px solid white' : '1px solid #333'};background:#111;cursor:pointer;`;

                wrapper.innerHTML = `
                    <img src="${url}" style="width:100%;height:100%;object-fit:cover;" title="Click to make primary">
                    <div style="position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.7);color:#ff4d4d;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;font-weight:bold;" onclick="event.stopPropagation(); window.removeAdminImage(${idx})">&times;</div>
                    ${isPrimary ? '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(255,255,255,0.9);color:black;font-size:9px;text-align:center;font-weight:bold;padding:1px 0;">Primary</div>' : ''}
                `;

                wrapper.addEventListener('click', () => {
                    window.makePrimaryAdminImage(idx);
                });

                list.appendChild(wrapper);
            });

            // Sync with hidden prod-image input for HTML5 form validation
            const prodImageInput = document.getElementById('prod-image');
            if (prodImageInput) {
                prodImageInput.value = window.adminImagesList[0] || '';
            }
        };

        window.removeAdminImage = (idx) => {
            window.adminImagesList.splice(idx, 1);
            window.renderAdminImages();
        };

        window.makePrimaryAdminImage = (idx) => {
            if (idx === 0) return;
            const img = window.adminImagesList.splice(idx, 1)[0];
            window.adminImagesList.unshift(img);
            window.renderAdminImages();
        };

        const addImageUrl = () => {
            const input = document.getElementById('prod-image-url-input');
            const val = input.value.trim();
            if (val) {
                window.adminImagesList.push(val);
                window.renderAdminImages();
                input.value = '';
            }
        };

        document.getElementById('add-image-btn').addEventListener('click', addImageUrl);
        document.getElementById('prod-image-url-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addImageUrl();
            }
        });

        document.getElementById('prod-image-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const btn = document.querySelector('#product-form button[type="submit"]');
            if (!btn) return;
            const originalBtnText = btn.textContent;
            btn.textContent = 'Uploading...';
            btn.disabled = true;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', 'kff1ziju');
            const cloudName = 'dfwmtfbtl';

            try {
                const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (data.secure_url) {
                    window.adminImagesList.push(data.secure_url);
                    window.renderAdminImages();
                } else {
                    alert('Upload failed: ' + (data.error?.message || 'Check Cloudinary settings.'));
                }
            } catch (err) {
                console.error(err);
                alert('Error uploading image.');
            } finally {
                btn.textContent = originalBtnText;
                btn.disabled = false;
                e.target.value = '';
            }
        });
    }

    // Inject the interactive sizes UI once
    const sizesContainer = document.getElementById('prod-sizes')?.parentElement;
    if (sizesContainer && !document.getElementById('sizes-ui-injected')) {
        sizesContainer.innerHTML = `
            <label style="display:block;margin-bottom:5px;color:#8f8f8f;font-size:14px;">Available Sizes (Optional)</label>
            <div id="sizes-ui-injected" style="display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;gap:10px;">
                    <input type="text" id="prod-size-input" placeholder="Type a size and press Enter (e.g. M)" 
                        style="flex:1;padding:10px;background:#1a1a1a;border:1px solid #333;color:white;border-radius:8px;">
                    <button type="button" id="add-size-btn" style="padding:10px 20px;background:white;color:black;border:none;border-radius:8px;cursor:pointer;font-weight:bold;">Enter</button>
                </div>
                <div id="sizes-chip-list" style="display:flex;flex-wrap:wrap;gap:10px;"></div>
                <input type="hidden" id="prod-sizes" value="">
            </div>
        `;

        window.adminSizes = [];

        window.renderAdminSizes = () => {
            const list = document.getElementById('sizes-chip-list');
            list.innerHTML = '';
            window.adminSizes.forEach((size, idx) => {
                const chip = document.createElement('div');
                chip.style.cssText = 'display:flex;align-items:center;gap:8px;padding:6px 12px;background:#333;color:white;border-radius:20px;font-size:13px;font-weight:bold;';
                chip.innerHTML = `
                    ${size}
                    <span style="cursor:pointer;color:#ff4d4d;font-size:16px;line-height:1;" onclick="window.removeAdminSize(${idx})">&times;</span>
                `;
                list.appendChild(chip);
            });
            document.getElementById('prod-sizes').value = window.adminSizes.join(',');
        };

        window.removeAdminSize = (idx) => {
            window.adminSizes.splice(idx, 1);
            window.renderAdminSizes();
        };

        const addSize = () => {
            const val = document.getElementById('prod-size-input').value.trim().toUpperCase();
            if (val && !window.adminSizes.includes(val)) {
                window.adminSizes.push(val);
                window.renderAdminSizes();
            }
            document.getElementById('prod-size-input').value = '';
        };

        document.getElementById('add-size-btn').addEventListener('click', addSize);
        document.getElementById('prod-size-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // prevent form submit
                addSize();
            }
        });
    }

    if (isEdit) {
        document.getElementById('prod-id').value = product.id;
        document.getElementById('prod-title').value = product.title;
        document.getElementById('prod-price').value = product.price;
        document.getElementById('prod-desc').value = product.description;

        const stockInput = document.getElementById('prod-stock');
        if (stockInput) stockInput.value = product.stock !== undefined ? product.stock : 1;

        const shippingSelect = document.getElementById('prod-shipping-size');
        if (shippingSelect) shippingSelect.value = product.shippingSize || 'small';

        window.adminSizes = [];
        if (product.sizes) {
            if (Array.isArray(product.sizes)) {
                window.adminSizes = [...product.sizes];
            } else if (typeof product.sizes === 'string') {
                window.adminSizes = product.sizes.split(',').map(s => s.trim()).filter(s => s !== '');
            }
        }
        if (window.renderAdminSizes) window.renderAdminSizes();

        window.adminImagesList = [];
        if (product.imageUrls) {
            window.adminImagesList = [...product.imageUrls];
        } else if (product.imageUrl) {
            window.adminImagesList = [product.imageUrl];
        }
        if (window.renderAdminImages) window.renderAdminImages();

        // Marcar el checkbox si ya es featured
        const featuredCheck = document.getElementById('prod-featured');
        if (featuredCheck) featuredCheck.checked = product.featured === true;
    } else {
        productForm.reset();
        document.getElementById('prod-id').value = '';
        const shippingSelect = document.getElementById('prod-shipping-size');
        if (shippingSelect) shippingSelect.value = 'free';
        window.adminSizes = [];
        if (window.renderAdminSizes) window.renderAdminSizes();
        window.adminImagesList = [];
        if (window.renderAdminImages) window.renderAdminImages();
    }

    // Inyectar checkbox de Featured si no existe ya
    if (!document.getElementById('prod-featured')) {
        const featuredDiv = document.createElement('div');
        featuredDiv.id = 'featured-row';
        featuredDiv.style.cssText = 'margin-bottom:20px;display:flex;align-items:center;gap:12px;padding:12px;background:#1a1a1a;border:1px solid #333;border-radius:8px;';
        featuredDiv.innerHTML = `
            <input type="checkbox" id="prod-featured"
                style="width:18px;height:18px;cursor:pointer;accent-color:#fff;">
            <label for="prod-featured" style="color:#e0e0e0;font-size:14px;cursor:pointer;margin:0;">
                Add to <strong>Featured Catalog</strong>
            </label>
        `;
        // Insertar antes de los botones del formulario
        const btnRow = productForm.querySelector('div[style*="flex-end"]');
        if (btnRow) productForm.insertBefore(featuredDiv, btnRow);
    }

    // Si es edición, marcar/desmarcar
    const featuredCheck = document.getElementById('prod-featured');
    if (featuredCheck && isEdit) featuredCheck.checked = product.featured === true;
    if (featuredCheck && !isEdit) featuredCheck.checked = false;

    productModal.style.display = 'flex';
}

async function handleProductSubmit(e) {
    e.preventDefault();

    const featuredEl = document.getElementById('prod-featured');
    const stockEl = document.getElementById('prod-stock');
    const sizesEl = document.getElementById('prod-sizes');
    const shippingEl = document.getElementById('prod-shipping-size');
    const id = document.getElementById('prod-id').value;
    const imageUrls = window.adminImagesList || [];
    const productData = {
        title: document.getElementById('prod-title').value,
        category: document.getElementById('prod-category').value.toUpperCase(),
        price: parseFloat(document.getElementById('prod-price').value),
        description: document.getElementById('prod-desc').value,
        imageUrl: imageUrls[0] || '',
        imageUrls: imageUrls,
        featured: featuredEl ? featuredEl.checked : false,
        stock: stockEl ? parseInt(stockEl.value) : 1,
        sizes: sizesEl ? sizesEl.value.trim() : '',
        shippingSize: shippingEl ? shippingEl.value : 'small'
    };

    try {
        if (id) {
            await updateDoc(doc(db, "products", id), productData);
        } else {
            await addDoc(collection(db, "products"), productData);
        }
        productModal.style.display = 'none';
        productForm.reset();
        const fr = document.getElementById('featured-row');
        if (fr) fr.remove();
    } catch (error) {
        alert("Error saving product: " + error.message);
    }
}

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        try {
            await deleteDoc(doc(db, "products", id));
        } catch (error) {
            alert("Error deleting product: " + error.message);
        }
    }
}
