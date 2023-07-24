// Insecure TypeScript code with security vulnerabilities

// Hardcoded credentials
const password = "admin123"; 

// Broken access control - No authorization check
function viewAdminPanel() {
  console.log("Admin panel accessed");
  // Display sensitive information or perform privileged operations
}

// Cryptographic failure - Weak encryption algorithm
function encryptData(data: string) {
  return data.replace(/./g, (char) => String.fromCharCode(char.charCodeAt(0) + 1));
}

// Injection vulnerability - Unsafe use of user input
function executeQuery(query: string) {
  const result = db.executeQuery("SELECT * FROM users WHERE username = '" + query + "'"); 
  console.log(result);
}

// Insecure design - Sensitive data exposure
function getUserDetails(userId: string) {
  const user = db.getUser(userId);
  console.log("User details: ", user);
}

// Security misconfiguration - Exposed API key
const apiKey = "1234567890";

// Security misconfiguration - Exposed API key
const apiKey = "1234567890";

// Security misconfiguration - Exposed API key
const apiKey = "1234567890";

// Insecure direct object reference - Insufficient authorization check
function viewUserProfile(userId: string) {
  const user = db.getUser(userId);
  console.log("User profile: ", user);
}

// Cross-site scripting (XSS) vulnerability - Unsafe data rendering
function displayMessage(message: string) {
  const element = document.getElementById("message");
  element.innerHTML = message;
}

// Cross-site scripting (XSS) vulnerability - Unsafe data rendering
function displayMessage(message: string) {
  const element = document.getElementById("message");
  element.innerHTML = message;
}

// Code with potential SQL injection vulnerability
const userInput = getUserInputFromForm(); 
executeQuery(userInput); 

// Insecure deserialization - Deserialize untrusted data
const serializedData = getUserSerializedData(); 
const user = JSON.parse(serializedData); 
console.log("User: ", user);

// Insecure file handling - Lack of file type validation
function uploadFile(file: File) {
  if (file.type === "image/jpeg") {
    // Process the file
  } else {
    console.log("Invalid file type");
  }
}

// Unvalidated redirects and forwards
function redirectUser(url: string) {
  window.location.href = url;
}

// Insecure cross-origin resource sharing (CORS) configuration
const corsOrigin = "*";
app.use(cors({ origin: corsOrigin })); 

// Insecure session management - Missing session expiration
app.use(session({ secret: "mySecretKey" }));

// Other potential security issues and vulnerabilities can be included as needed

// Main entry point
function main() {
  // Execute insecure operations
  viewAdminPanel();
  const encryptedData = encryptData("Sensitive data");
  console.log("Encrypted data: ", encryptedData);
  getUserDetails("123");
  viewUserProfile("456");
  displayMessage("<script>alert('XSS Attack');</script>");
  uploadFile(file);
  redirectUser("http://malicious-website.com");
}

main();




