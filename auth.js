import { auth, db } from './firebase-config.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
    doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

// Manejar Inicio de Sesión
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const errorMsg = document.getElementById('error-msg');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = 'index.html';
        } catch (error) {
            errorMsg.style.display = 'block';
            errorMsg.textContent = 'Error: ' + error.message;
        }
    });
}

// Manejar Registro
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const errorMsg = document.getElementById('reg-error-msg');

        try {
            const username = document.getElementById('reg-username').value;
            // Crear usuario en Firebase Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Save el rol y nombre de usuario en Firestore (por defecto "user")
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                username: username,
                role: "user" // Aquí defines que todos los nuevos son "user"
            });

            // Enviar correo de bienvenida por medio de la API en Vercel
            try {
                await fetch('/api/send-welcome-email', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: user.email,
                        username: username
                    })
                });
            } catch (emailErr) {
                console.error("Error al enviar el correo de bienvenida:", emailErr);
            }

            window.location.href = 'index.html';
        } catch (error) {
            errorMsg.style.display = 'block';
            errorMsg.textContent = 'Error: ' + error.message;
        }
    });
}
