import { auth, db } from "./firebase-config.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");

const registerForm = document.getElementById("register-form");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("logout-btn");
const userEmail = document.getElementById("user-email");
const studentForm = document.getElementById("student-form");
const recordsBody = document.getElementById("records-body");
const studentMessage = document.getElementById("student-message");
const registerMessage = document.getElementById("register-message");
const loginMessage = document.getElementById("login-message");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit-btn");
const formTitle = document.getElementById("form-title");
const refreshBtn = document.getElementById("refresh-btn");

let currentUser = null;
let editingRecordId = null;

function showMessage(element, message, type = "") {
  element.textContent = message;
  element.className = "message";

  if (type) {
    element.classList.add(type);
  }
}

function clearStudentForm() {
  studentForm.reset();
  editingRecordId = null;
  formTitle.textContent = "Add Student Record";
  submitBtn.textContent = "Add Record";
  cancelEditBtn.classList.add("hidden");
}

function getStudentFormData() {
  return {
    fullName: document.getElementById("full-name").value.trim(),
    studentID: document.getElementById("student-id").value.trim(),
    programme: document.getElementById("programme").value.trim(),
    year: Number(document.getElementById("year").value),
    email: document.getElementById("student-email").value.trim(),
    favouriteTechnology: document.getElementById("favourite-technology").value.trim(),
  };
}

function populateStudentForm(data) {
  document.getElementById("full-name").value = data.fullName || "";
  document.getElementById("student-id").value = data.studentID || "";
  document.getElementById("programme").value = data.programme || "";
  document.getElementById("year").value = data.year || "";
  document.getElementById("student-email").value = data.email || "";
  document.getElementById("favourite-technology").value = data.favouriteTechnology || "";
}

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(registerMessage, "");

  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirmPassword = document.getElementById("register-confirm-password").value;

  if (password !== confirmPassword) {
    showMessage(registerMessage, "Passwords do not match.", "error");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
    showMessage(registerMessage, "Registration successful.", "success");
    registerForm.reset();
  } catch (error) {
    console.error(error);
    showMessage(registerMessage, getAuthErrorMessage(error.code), "error");
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(loginMessage, "");

  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginForm.reset();
  } catch (error) {
    console.error(error);
    showMessage(loginMessage, "Unable to log in. Please check your credentials.", "error");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    alert("Unable to log out.");
  }
});

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userEmail.textContent = user.email;
    await loadRecords();
  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userEmail.textContent = "";
    clearStudentForm();
    recordsBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">No records found.</td>
      </tr>
    `;
  }
});

studentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!currentUser) {
    showMessage(studentMessage, "You must be logged in.", "error");
    return;
  }

  const data = getStudentFormData();

  if (!data.fullName || !data.studentID || !data.programme || !data.year || !data.email || !data.favouriteTechnology) {
    showMessage(studentMessage, "Please complete all required fields.", "error");
    return;
  }

  try {
    if (editingRecordId) {
      const recordRef = doc(db, "students", editingRecordId);
      await updateDoc(recordRef, data);
      showMessage(studentMessage, "Record updated successfully.", "success");
    } else {
      await addDoc(collection(db, "students"), {
        ...data,
        ownerId: currentUser.uid,
        createdAt: serverTimestamp(),
      });
      showMessage(studentMessage, "Record added successfully.", "success");
    }

    clearStudentForm();
    await loadRecords();
  } catch (error) {
    console.error(error);
    showMessage(studentMessage, "Unable to save the record.", "error");
  }
});

async function loadRecords() {
  if (!currentUser) {
    return;
  }

  recordsBody.innerHTML = `
    <tr>
      <td colspan="7" class="empty">Loading records...</td>
    </tr>
  `;

  try {
    const studentsRef = collection(db, "students");
    const q = query(studentsRef, where("ownerId", "==", currentUser.uid));
    const querySnapshot = await getDocs(q);

    recordsBody.innerHTML = "";

    if (querySnapshot.empty) {
      recordsBody.innerHTML = `
        <tr>
          <td colspan="7" class="empty">No records found.</td>
        </tr>
      `;
      return;
    }

    querySnapshot.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const row = document.createElement("tr");

      row.innerHTML = `
        <td>${escapeHTML(data.fullName)}</td>
        <td>${escapeHTML(data.studentID)}</td>
        <td>${escapeHTML(data.programme)}</td>
        <td>${escapeHTML(String(data.year))}</td>
        <td>${escapeHTML(data.email)}</td>
        <td>${escapeHTML(data.favouriteTechnology)}</td>
        <td>
          <div class="actions">
            <button class="btn btn-edit" data-action="edit" data-id="${documentSnapshot.id}">Edit</button>
            <button class="btn btn-delete" data-action="delete" data-id="${documentSnapshot.id}">Delete</button>
          </div>
        </td>
      `;

      row.dataset.record = JSON.stringify({
        id: documentSnapshot.id,
        ...data,
      });

      recordsBody.appendChild(row);
    });
  } catch (error) {
    console.error(error);
    recordsBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty">Unable to load records.</td>
      </tr>
    `;
  }
}

recordsBody.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) {
    return;
  }

  const recordId = button.dataset.id;
  const row = button.closest("tr");

  if (button.dataset.action === "edit") {
    const record = JSON.parse(row.dataset.record);
    editingRecordId = recordId;
    populateStudentForm(record);

    formTitle.textContent = "Edit Student Record";
    submitBtn.textContent = "Update Record";
    cancelEditBtn.classList.remove("hidden");

    window.scrollTo({ top: 0, behavior: "smooth" });
    showMessage(studentMessage, "Edit the record and select Update Record.", "success");
  }

  if (button.dataset.action === "delete") {
    const confirmed = confirm("Are you sure you want to delete this record?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, "students", recordId));
      showMessage(studentMessage, "Record deleted successfully.", "success");
      await loadRecords();
    } catch (error) {
      console.error(error);
      showMessage(studentMessage, "Unable to delete the record.", "error");
    }
  }
});

cancelEditBtn.addEventListener("click", () => {
  clearStudentForm();
  showMessage(studentMessage, "Edit cancelled.", "");
});

refreshBtn.addEventListener("click", async () => {
  await loadRecords();
});

function getAuthErrorMessage(code) {
  switch (code) {
    case "auth/email-already-in-use":
      return "This email is already registered.";
    case "auth/invalid-email":
      return "Please enter a valid email address.";
    case "auth/weak-password":
      return "Password is too weak.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
    case "auth/user-not-found":
      return "Invalid email or password.";
    case "auth/wrong-password":
      return "Invalid email or password.";
    default:
      return "An authentication error occurred.";
  }
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
