// User data structure
const users = {
    "1234": { name: "Sayantan", folder: "1234" },
    "5678": { name: "aalez", folder: "5678" },
    "0907": { name: "raj", folder: "0907" }
};

// Database configuration
let db;
const DB_NAME = "FileStorageSystem";
const DB_VERSION = 1;
const STORE_NAME = "userFiles";

// DOM elements
const loginScreen = document.getElementById('login-screen');
const dashboard = document.getElementById('dashboard');
const pinInput = document.getElementById('pin-input');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const usernameDisplay = document.getElementById('username-display');
const logoutBtn = document.getElementById('logout-btn');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgress = document.getElementById('upload-progress');
const fileList = document.getElementById('file-list');
const noFilesMessage = document.getElementById('no-files-message');

// Current user
let currentUser = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeDatabase();
        checkExistingSession();
        setupEventListeners();
    } catch (error) {
        console.error("Initialization error:", error);
        showError("Failed to initialize application");
    }
});

// Initialize IndexedDB
function initializeDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            console.error("Database error:", event.target.error);
            reject("Database initialization failed");
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            resolve();
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
                store.createIndex("pin", "pin", { unique: false });
                store.createIndex("name", "name", { unique: false });
            }
        };
    });
}

// Check for existing session
function checkExistingSession() {
    const savedUser = sessionStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
        loadUserFiles();
    }
}

// Set up event listeners
function setupEventListeners() {
    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    uploadBtn.addEventListener('click', handleUpload);
    pinInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

// Handle login
function handleLogin() {
    const pin = pinInput.value.trim();
    
    if (!pin || pin.length !== 4) {
        showError("Please enter a 4-digit PIN");
        return;
    }

    if (users[pin]) {
        currentUser = users[pin];
        sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
        showDashboard();
        loadUserFiles();
    } else {
        showError("Invalid PIN. Please try again.");
    }
}

// Handle logout
function handleLogout() {
    currentUser = null;
    sessionStorage.removeItem('currentUser');
    showLogin();
    pinInput.value = '';
}

// Handle file upload
async function handleUpload() {
    const files = fileInput.files;
    
    if (!files || files.length === 0) {
        showError("Please select at least one file");
        return;
    }

    uploadProgress.textContent = "Preparing upload...";
    
    try {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            uploadProgress.textContent = `Uploading ${i+1}/${files.length}: ${file.name}`;
            
            // Read file as ArrayBuffer
            const arrayBuffer = await readFileAsArrayBuffer(file);
            
            // Store file in database
            await storeFile({
                id: generateFileId(),
                pin: currentUser.folder,
                name: file.name,
                type: file.type,
                size: file.size,
                data: arrayBuffer,
                uploadDate: new Date().toISOString()
            });
        }
        
        uploadProgress.textContent = "Upload completed successfully!";
        loadUserFiles();
    } catch (error) {
        console.error("Upload error:", error);
        uploadProgress.textContent = "Upload failed. Please try again.";
    } finally {
        fileInput.value = '';
    }
}

// Generate unique file ID
function generateFileId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// Read file as ArrayBuffer
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = (error) => reject(error);
        reader.readAsArrayBuffer(file);
    });
}

// Store file in IndexedDB
function storeFile(fileData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.add(fileData);
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

// Load user files
async function loadUserFiles() {
    try {
        const files = await getUserFiles(currentUser.folder);
        displayFiles(files);
    } catch (error) {
        console.error("Error loading files:", error);
        showError("Failed to load files");
    }
}

// Get files for specific user
function getUserFiles(pin) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("pin");
        const request = index.getAll(pin);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Display files in UI
function displayFiles(files) {
    if (files.length === 0) {
        noFilesMessage.classList.remove('hidden');
        fileList.innerHTML = '';
        return;
    }
    
    noFilesMessage.classList.add('hidden');
    fileList.innerHTML = files.map(file => `
        <li>
            <span class="file-name">${file.name}</span>
            <span class="file-info">${formatFileSize(file.size)} - ${formatDate(file.uploadDate)}</span>
            <div class="file-actions">
                <button class="btn download-btn" data-file="${file.name}">Download</button>
                <button class="btn delete-btn" data-file="${file.name}">Delete</button>
            </div>
        </li>
    `).join('');
    
    // Add event listeners to new buttons
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filename = e.target.getAttribute('data-file');
            downloadFile(filename);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filename = e.target.getAttribute('data-file');
            deleteFile(filename);
        });
    });
}

// Download file
async function downloadFile(filename) {
    try {
        const fileData = await getFile(currentUser.folder, filename);
        
        // Convert ArrayBuffer to Blob
        const blob = new Blob([fileData.data], { type: fileData.type });
        const url = URL.createObjectURL(blob);
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    } catch (error) {
        console.error("Download error:", error);
        alert("Failed to download file");
    }
}

// Get specific file from database
function getFile(pin, filename) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const index = store.index("pin");
        const request = index.openCursor(IDBKeyRange.only(pin));
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (cursor.value.name === filename) {
                    resolve(cursor.value);
                } else {
                    cursor.continue();
                }
            } else {
                reject(new Error("File not found"));
            }
        };
        
        request.onerror = (event) => reject(event.target.error);
    });
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete ${filename}?`)) return;
    
    try {
        const fileData = await getFile(currentUser.folder, filename);
        await deleteFileFromDB(fileData.id);
        loadUserFiles();
    } catch (error) {
        console.error("Delete error:", error);
        alert("Failed to delete file");
    }
}

// Delete file from database
function deleteFileFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        
        const request = store.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event.target.error);
    });
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Helper function to format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Show error message
function showError(message) {
    loginError.textContent = message;
    setTimeout(() => {
        loginError.textContent = '';
    }, 3000);
}

// Show dashboard
function showDashboard() {
    loginScreen.classList.add('hidden');
    dashboard.classList.remove('hidden');
    usernameDisplay.textContent = currentUser.name;
}

// Show login screen
function showLogin() {
    dashboard.classList.add('hidden');
    loginScreen.classList.remove('hidden');
}