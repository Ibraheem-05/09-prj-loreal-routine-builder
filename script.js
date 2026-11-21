/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const languageSelect = document.getElementById("languageSelect");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsButton = document.getElementById("clearSelections");
const generateRoutineButton = document.getElementById("generateRoutine");
const sendButton = document.getElementById("sendBtn");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

// Keep track of selected products and descriptions opened by the user
const selectedProducts = new Map();
const openDescriptions = new Set();
let allProducts = []; // filled once products.json has loaded
let busy = false; // true while we wait for the AI
const workerUrl = "https://09-prj-loreal-routine-builder.hq3717.workers.dev";

// localStorage keys (used to remember selections and language after a reload)
const SELECTED_KEY = "loreal-routine-selected";
const LANGUAGE_KEY = "loreal-routine-language";

// Conversation history lets the AI remember the routine and follow-up questions
const messages = [
  {
    role: "system",
    content:
      "You are a friendly L'Oréal skincare and beauty advisor. Use only the selected products provided by the user. Create a clear, personalized routine with the correct order, benefits, and simple usage directions.",
  },
];

/* ---------- Languages (LevelUp: RTL support) ---------- */

// Text for each language. Arabic is a right-to-left (RTL) language.
// To add another one, add a new block here and an <option> in index.html.
const translations = {
  en: {
    dir: "ltr",
    language: "Language",
    title: "Smart Routine & Product Advisor",
    searchLabel: "Search products",
    searchPlaceholder: "Search products by name or keyword…",
    categoryLabel: "Category",
    allCategories: "All Categories",
    cat_cleanser: "Cleansers",
    cat_moisturizer: "Moisturizers & Treatments",
    cat_skincare: "Skincare & Serums",
    cat_haircare: "Haircare",
    cat_makeup: "Makeup",
    cat_hairColor: "Hair Color",
    cat_hairStyling: "Hair Styling",
    cat_mensGrooming: "Men's Grooming",
    cat_suncare: "Suncare",
    cat_fragrance: "Fragrance",
    selectedHeading: "Selected Products",
    clearAll: "Clear all",
    generate: "Generate Routine",
    chatHeading: "Let's Build Your Routine",
    messageLabel: "Message",
    chatPlaceholder: "Ask me about products or routines…",
    send: "Send",
    rights: "© 2025 L'Oréal. All rights reserved.",
    privacy: "Privacy Policy",
    terms: "Terms of Use",
    contact: "Contact",
    pickCategory: "Select a category or search to view products",
    noMatches: "No products match your search",
    noneSelected: "No products selected yet",
    viewDetails: "View details",
    hideDetails: "Hide details",
    select: "Select",
    unselect: "Unselect",
    remove: "Remove",
    selectAtLeastOne: "Select at least one product to generate a routine.",
    creating: "Creating your personalized routine...",
    thinking: "Searching and thinking...",
    routineError: "Sorry, the routine could not be generated. Please try again.",
    chatError: "Sorry, I could not answer that question. Please try again.",
    loadError: "Sorry, the products could not be loaded.",
  },
  ar: {
    dir: "rtl",
    language: "اللغة",
    title: "مستشار الروتين والمنتجات الذكي",
    searchLabel: "ابحث عن المنتجات",
    searchPlaceholder: "ابحث عن المنتجات بالاسم أو الكلمة المفتاحية…",
    categoryLabel: "الفئة",
    allCategories: "جميع الفئات",
    cat_cleanser: "المنظفات",
    cat_moisturizer: "المرطبات والعلاجات",
    cat_skincare: "العناية بالبشرة والسيروم",
    cat_haircare: "العناية بالشعر",
    cat_makeup: "المكياج",
    cat_hairColor: "صبغات الشعر",
    cat_hairStyling: "تصفيف الشعر",
    cat_mensGrooming: "العناية بالرجال",
    cat_suncare: "الحماية من الشمس",
    cat_fragrance: "العطور",
    selectedHeading: "المنتجات المختارة",
    clearAll: "مسح الكل",
    generate: "إنشاء الروتين",
    chatHeading: "لنبنِ روتينك",
    messageLabel: "الرسالة",
    chatPlaceholder: "اسألني عن المنتجات أو الروتين…",
    send: "إرسال",
    rights: "© 2025 لوريال. جميع الحقوق محفوظة.",
    privacy: "سياسة الخصوصية",
    terms: "شروط الاستخدام",
    contact: "اتصل بنا",
    pickCategory: "اختر فئة أو ابحث لعرض المنتجات",
    noMatches: "لا توجد منتجات مطابقة لبحثك",
    noneSelected: "لم يتم اختيار أي منتجات بعد",
    viewDetails: "عرض التفاصيل",
    hideDetails: "إخفاء التفاصيل",
    select: "اختيار",
    unselect: "إلغاء اختيار",
    remove: "إزالة",
    selectAtLeastOne: "اختر منتجًا واحدًا على الأقل لإنشاء الروتين.",
    creating: "جارٍ إنشاء روتينك الشخصي...",
    thinking: "جارٍ البحث والتفكير...",
    routineError: "عذرًا، تعذّر إنشاء الروتين. يرجى المحاولة مرة أخرى.",
    chatError: "عذرًا، لم أتمكن من الإجابة عن هذا السؤال. يرجى المحاولة مرة أخرى.",
    loadError: "عذرًا، تعذّر تحميل المنتجات.",
  },
};

let currentLanguage = "en";

/* Look up a piece of text in the current language */
function t(key) {
  return translations[currentLanguage][key] || translations.en[key] || key;
}

/* Switch the whole page to a language (and flip the layout for RTL) */
function applyLanguage(language) {
  currentLanguage = translations[language] ? language : "en";

  // dir="rtl" flips the page layout; lang helps fonts and screen readers
  document.documentElement.lang = currentLanguage;
  document.documentElement.dir = translations[currentLanguage].dir;
  languageSelect.value = currentLanguage;

  // Fill in every element that has a data-i18n label
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  });

  saveToStorage(LANGUAGE_KEY, currentLanguage);

  // Re-draw the parts that are built by JavaScript
  showProducts();
  updateSelectedProducts();
}

/* ---------- localStorage helpers (saved selections) ---------- */

function saveToStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error("Could not save to localStorage", error);
  }
}

function readFromStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (error) {
    return null;
  }
}

/* Remember which product ids are selected */
function saveSelection() {
  saveToStorage(SELECTED_KEY, Array.from(selectedProducts.keys()));
}

/* ---------- Products ---------- */

/* Load product data from the JSON file (only downloaded once) */
async function loadProducts() {
  if (allProducts.length === 0) {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
  }
  return allProducts;
}

/* Does a product match the words typed in the search box? */
function matchesSearch(product, searchText) {
  const words = searchText.toLowerCase().split(/\s+/).filter(Boolean);
  const text =
    `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
  // Every typed word must appear somewhere in the product info
  return words.every((word) => text.includes(word));
}

/* Show the products that match BOTH the category and the search text */
async function showProducts() {
  const category = categoryFilter.value;
  const searchText = productSearch.value.trim();

  // Nothing chosen yet: show the helpful placeholder
  if (category === "" && searchText === "") {
    productsContainer.innerHTML = `
      <div class="placeholder-message">${t("pickCategory")}</div>
    `;
    return;
  }

  try {
    const products = await loadProducts();

    /* filter() creates a new array with only the matching products */
    const filteredProducts = products.filter(
      (product) =>
        (category === "" || product.category === category) &&
        (searchText === "" || matchesSearch(product, searchText))
    );

    displayProducts(filteredProducts);
  } catch (error) {
    console.error(error);
    productsContainer.innerHTML = `
      <div class="placeholder-message">${t("loadError")}</div>
    `;
  }
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">${t("noMatches")}</div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.has(product.id);
      const isOpen = openDescriptions.has(product.id);
      return `
    <article
      class="product-card${isSelected ? " selected" : ""}"
      data-product-id="${product.id}"
      tabindex="0"
      role="button"
      aria-pressed="${isSelected}"
      aria-label="${isSelected ? t("unselect") : t("select")} ${product.name}"
    >
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button
          type="button"
          class="details-btn"
          data-details-id="${product.id}"
          aria-expanded="${isOpen}"
        >
          ${isOpen ? t("hideDetails") : t("viewDetails")}
        </button>
        <p class="product-description${isOpen ? " open" : ""}" id="description-${product.id}">
          ${product.description}
        </p>
      </div>
    </article>
  `;
    })
    .join("");
}

/* Update the selected products section and card highlighting */
function updateSelectedProducts() {
  if (selectedProducts.size === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-placeholder">${t("noneSelected")}</p>
    `;
  } else {
    selectedProductsList.innerHTML = Array.from(selectedProducts.values())
      .map(
        (product) => `
        <div class="selected-product">
          <span>${product.brand} - ${product.name}</span>
          <button
            type="button"
            class="remove-product"
            data-remove-id="${product.id}"
            aria-label="${t("remove")} ${product.name}"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      `
      )
      .join("");
  }

  // The Clear all button only makes sense when something is selected
  clearSelectionsButton.hidden = selectedProducts.size === 0;

  // Refresh card classes so they reflect the current selection
  document.querySelectorAll(".product-card").forEach((card) => {
    const productId = Number(card.dataset.productId);
    const isSelected = selectedProducts.has(productId);
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", isSelected);

    const name = card.querySelector("h3").textContent;
    card.setAttribute(
      "aria-label",
      `${isSelected ? t("unselect") : t("select")} ${name}`
    );
  });
}

/* Add or remove a product when its card is clicked */
productsContainer.addEventListener("click", (event) => {
  const detailsButton = event.target.closest(".details-btn");

  if (detailsButton) {
    event.stopPropagation();
    const productId = Number(detailsButton.dataset.detailsId);

    if (openDescriptions.has(productId)) {
      openDescriptions.delete(productId);
    } else {
      openDescriptions.add(productId);
    }

    const card = detailsButton.closest(".product-card");
    const description = card.querySelector(".product-description");
    const isOpen = openDescriptions.has(productId);
    description.classList.toggle("open", isOpen);
    detailsButton.textContent = isOpen ? t("hideDetails") : t("viewDetails");
    detailsButton.setAttribute("aria-expanded", isOpen);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.productId);

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    const product = allProducts.find((item) => item.id === productId);
    if (product) selectedProducts.set(productId, product);
  }

  saveSelection();
  updateSelectedProducts();
});

/* Allow keyboard users to select a card with Enter or Space */
productsContainer.addEventListener("keydown", (event) => {
  if (event.target.classList.contains("details-btn")) return;

  if (event.key === "Enter" || event.key === " ") {
    const card = event.target.closest(".product-card");
    if (card) {
      event.preventDefault();
      card.click();
    }
  }
});

/* Remove a product directly from the selected products list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-product");
  if (!removeButton) return;

  const productId = Number(removeButton.dataset.removeId);
  selectedProducts.delete(productId);
  saveSelection();
  updateSelectedProducts();
});

/* Clear every selected product at once */
clearSelectionsButton.addEventListener("click", () => {
  selectedProducts.clear();
  saveSelection();
  updateSelectedProducts();
});

/* Filter again when the category changes or when the user types in the search box */
categoryFilter.addEventListener("change", showProducts);
productSearch.addEventListener("input", showProducts);

/* Change language when the user picks one */
languageSelect.addEventListener("change", (event) => {
  applyLanguage(event.target.value);
});

/* ---------- Chat ---------- */

/* Disable the buttons while we wait for the AI so requests don't pile up */
function setBusy(value) {
  busy = value;
  generateRoutineButton.disabled = value;
  sendButton.disabled = value;
}

/* Send the full conversation to the Worker and return the assistant reply */
async function sendToWorker() {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    // language tells the AI which language to answer in
    body: JSON.stringify({ messages, language: currentLanguage }),
  });

  if (!response.ok) {
    throw new Error(`Worker request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/* Put text in an element, turning web addresses into safe clickable links.
   Works for plain links and for [title](link) links. */
function addTextWithLinks(element, text) {
  const linkPattern =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)<>"]*[^\s)<>".,;:!?])/g;
  let lastIndex = 0;

  for (const match of text.matchAll(linkPattern)) {
    element.append(text.slice(lastIndex, match.index));

    const link = document.createElement("a");
    link.href = match[2] || match[3];
    link.textContent = match[1] || match[3];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    element.append(link);

    lastIndex = match.index + match[0].length;
  }
  element.append(text.slice(lastIndex));
}

/* Turn line breaks into readable paragraphs in the chat window */
function displayChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;

  text.split("\n").forEach((line) => {
    if (line.trim() !== "") {
      const paragraph = document.createElement("p");
      paragraph.dir = "auto"; // each line picks its own direction (English or Arabic)
      addTextWithLinks(paragraph, line); // textContent-style: never inserts HTML
      messageElement.appendChild(paragraph);
    }
  });

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return messageElement;
}

/* Generate a routine using only the products selected by the user */
generateRoutineButton.addEventListener("click", async () => {
  if (busy) return;

  if (selectedProducts.size === 0) {
    chatWindow.innerHTML = `
      <p class="placeholder-message">${t("selectAtLeastOne")}</p>
    `;
    return;
  }

  // Collect ONLY the selected products
  const selectedProductsJson = Array.from(selectedProducts.values()).map(
    (product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    })
  );

  const userPrompt = `Build a personalized routine using only these selected products:\n${JSON.stringify(
    selectedProductsJson,
    null,
    2
  )}`;

  messages.push({
    role: "user",
    content: userPrompt,
  });

  chatWindow.innerHTML = `<p class="placeholder-message">${t("creating")}</p>`;
  setBusy(true);

  try {
    const reply = await sendToWorker();
    messages.push({
      role: "assistant",
      content: reply,
    });
    chatWindow.innerHTML = "";
    displayChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    messages.pop(); // a failed request should not stay in the history
    chatWindow.innerHTML = `
      <p class="placeholder-message">${t("routineError")}</p>
    `;
  } finally {
    setBusy(false);
  }
});

/* Send follow-up questions with the full conversation history */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;

  const userInput = document.getElementById("userInput");
  const question = userInput.value.trim();
  if (question === "") return;

  messages.push({
    role: "user",
    content: question,
  });

  displayChatMessage("user", question);
  userInput.value = "";
  const waiting = displayChatMessage("assistant", t("thinking"));
  setBusy(true);

  try {
    const reply = await sendToWorker();
    messages.push({
      role: "assistant",
      content: reply,
    });
    waiting.remove();
    displayChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    messages.pop(); // a failed request should not stay in the history
    waiting.remove();
    displayChatMessage("assistant", t("chatError"));
  } finally {
    setBusy(false);
  }
});

/* ---------- Start up ---------- */

/* Restore the saved selection and language when the page loads */
async function startPage() {
  // Language first, so the first thing drawn is already translated
  applyLanguage(readFromStorage(LANGUAGE_KEY) || "en");

  const savedIds = readFromStorage(SELECTED_KEY);
  if (Array.isArray(savedIds) && savedIds.length > 0) {
    try {
      const products = await loadProducts();
      savedIds.forEach((id) => {
        const product = products.find((item) => item.id === id);
        if (product) selectedProducts.set(id, product);
      });
    } catch (error) {
      console.error(error);
    }
  }

  updateSelectedProducts();
}

startPage();
