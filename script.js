/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const generateRoutineButton = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");

// Keep track of selected products and descriptions opened by the user
const selectedProducts = new Map();
const openDescriptions = new Set();
const workerUrl =
  "https://09-prj-loreal-routine-builder.hq3717.workers.dev";

// Conversation history lets the AI remember the routine and follow-up questions
const messages = [
  {
    role: "system",
    content:
      "You are a friendly L'Oréal skincare and beauty advisor. Use only the selected products provided by the user. Create a clear, personalized routine with the correct order, benefits, and simple usage directions.",
  },
];

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

// Show a helpful message before a product is selected
selectedProductsList.innerHTML = `
  <p class="selected-placeholder">No products selected yet</p>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map(
      (product) => `
    <article
      class="product-card${selectedProducts.has(product.id) ? " selected" : ""}"
      data-product-id="${product.id}"
      tabindex="0"
      role="button"
      aria-pressed="${selectedProducts.has(product.id)}"
      aria-label="${selectedProducts.has(product.id) ? "Unselect" : "Select"} ${product.name}"
    >
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p>${product.brand}</p>
        <button
          type="button"
          class="details-btn"
          data-details-id="${product.id}"
          aria-expanded="${openDescriptions.has(product.id)}"
        >
          ${openDescriptions.has(product.id) ? "Hide details" : "View details"}
        </button>
        <p class="product-description${openDescriptions.has(product.id) ? " open" : ""}" id="description-${product.id}">
          ${product.description}
        </p>
      </div>
    </article>
  `
    )
    .join("");
}

/* Update the selected products section and card highlighting */
function updateSelectedProducts() {
  if (selectedProducts.size === 0) {
    selectedProductsList.innerHTML = `
      <p class="selected-placeholder">No products selected yet</p>
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
            aria-label="Remove ${product.name}"
          >
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      `
      )
      .join("");
  }

  // Refresh card classes so they reflect the current selection
  document.querySelectorAll(".product-card").forEach((card) => {
    const productId = Number(card.dataset.productId);
    const isSelected = selectedProducts.has(productId);
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", isSelected);

    const name = card.querySelector("h3").textContent;
    card.setAttribute(
      "aria-label",
      `${isSelected ? "Unselect" : "Select"} ${name}`
    );
  });
}

/* Add or remove a product when its card is clicked */
productsContainer.addEventListener("click", async (event) => {
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
    detailsButton.textContent = isOpen ? "Hide details" : "View details";
    detailsButton.setAttribute("aria-expanded", isOpen);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) return;

  const productId = Number(card.dataset.productId);

  if (selectedProducts.has(productId)) {
    selectedProducts.delete(productId);
  } else {
    const products = await loadProducts();
    const product = products.find((item) => item.id === productId);
    if (product) selectedProducts.set(productId, product);
  }

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
  updateSelectedProducts();
});

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const selectedCategory = e.target.value;

  /* filter() creates a new array containing only products 
     where the category matches what the user selected */
  const filteredProducts = products.filter(
    (product) => product.category === selectedCategory
  );

  displayProducts(filteredProducts);
});

/* Send the full conversation to the Worker and return the assistant reply */
async function sendToWorker() {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Worker request failed with status ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/* Turn line breaks into readable paragraphs in the chat window */
function displayChatMessage(role, text) {
  const messageElement = document.createElement("div");
  messageElement.className = `chat-message ${role}`;

  text.split("\n").forEach((line) => {
    if (line.trim() !== "") {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      messageElement.appendChild(paragraph);
    }
  });

  chatWindow.appendChild(messageElement);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Generate a routine using only the products selected by the user */
generateRoutineButton.addEventListener("click", async () => {
  if (selectedProducts.size === 0) {
    chatWindow.innerHTML = `
      <p class="placeholder-message">Select at least one product to generate a routine.</p>
    `;
    return;
  }

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

  chatWindow.innerHTML =
    '<p class="placeholder-message">Creating your personalized routine...</p>';
  generateRoutineButton.disabled = true;

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
    chatWindow.innerHTML = `
      <p class="placeholder-message">Sorry, the routine could not be generated. Please try again.</p>
    `;
  } finally {
    generateRoutineButton.disabled = false;
  }
});

/* Send follow-up questions with the full conversation history */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const userInput = document.getElementById("userInput");
  const question = userInput.value.trim();
  if (question === "") return;

  messages.push({
    role: "user",
    content: question,
  });

  displayChatMessage("user", question);
  userInput.value = "";

  try {
    const reply = await sendToWorker();
    messages.push({
      role: "assistant",
      content: reply,
    });
    displayChatMessage("assistant", reply);
  } catch (error) {
    console.error(error);
    displayChatMessage(
      "assistant",
      "Sorry, I could not answer that question. Please try again."
    );
  }
});
