import { openInNewPage, openNetworkConnectPage } from "./open-link.js";

const WEBSITE_DATA_SOURCES = ["/data/websites.json", "./data/websites.json"];
const GROUP_DATA_SOURCES = ["/data/groups.json", "./data/groups.json"];
const IMAGE_DATA_SOURCES = ["/data/images.json", "./data/images.json"];
const ARTICLE_DATA_SOURCES = ["/data/articles.json", "./data/articles.json"];
const FAVORITES_KEY = "shunav:favorites";
const WEBSITE_SECTION_PREFIX = "website";
const GROUP_SECTION_PREFIX = "group";
const IMAGE_SECTION_PREFIX = "image";
const ARTICLE_SECTION_PREFIX = "article";
const FAVORITES_SECTION_ID = "favoritesSection";
const COPY_ICON_PATH = "img/icon/icon-copy.svg";

const state = {
    categories: [],
    groupCategories: [],
    imageCategories: [],
    articleCategories: [],
    itemByName: {},
    unifiedFavorites: [],
    searchQuery: ""
};

const refs = {
    favoritesNavList: document.getElementById("favoritesNavList"),
    navList: document.getElementById("categoryNavList"),
    groupNavList: document.getElementById("groupNavList"),
    imageNavList: document.getElementById("imageNavList"),
    articleNavList: document.getElementById("articleNavList"),
    contentPane: document.getElementById("contentPane"),
    favoritesGrid: document.getElementById("favoritesGrid"),
    categoriesContainer: document.getElementById("categoriesContainer"),
    groupCategoriesContainer: document.getElementById("groupCategoriesContainer"),
    imageCategoriesContainer: document.getElementById("imageCategoriesContainer"),
    articleCategoriesContainer: document.getElementById("articleCategoriesContainer"),
    searchInput: document.getElementById("categorySearchInput")
};

let sectionObserver = null;
const dragState = {
    draggingKey: "",
    suppressClickUntil: 0
};

const btn = document.getElementById('connectNetworkBtn');
if (btn) btn.addEventListener('click', openNetworkConnectPage);

function normalizeSearchText(value) {
    return typeof value !== "string" ? "" : value.trim().toLowerCase();
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function setHighlightedText(element, text, query) {
    const sourceText = typeof text === "string" ? text : "";
    const normalizedQuery = normalizeSearchText(query);

    element.textContent = "";

    if (!normalizedQuery) {
        element.textContent = sourceText;
        return;
    }

    const regex = new RegExp(escapeRegExp(normalizedQuery), "ig");
    let lastIndex = 0;
    let matched = false;
    let match = regex.exec(sourceText);

    while (match) {
        matched = true;

        if (match.index > lastIndex) {
            element.appendChild(document.createTextNode(sourceText.slice(lastIndex, match.index)));
        }

        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = sourceText.slice(match.index, match.index + match[0].length);
        element.appendChild(mark);

        lastIndex = match.index + match[0].length;
        match = regex.exec(sourceText);
    }

    if (!matched) {
        element.textContent = sourceText;
        return;
    }

    if (lastIndex < sourceText.length) {
        element.appendChild(document.createTextNode(sourceText.slice(lastIndex)));
    }
}

function matchesSearch(item, query) {
    if (!query) return true;

    const name = normalizeSearchText((item && (item.name || item.title)) || "");
    const url = normalizeSearchText((item && item.url) || "");
    const description = normalizeSearchText((item && item.description) || "");

    return name.includes(query) || url.includes(query) || description.includes(query);
}

function getFilteredCategories() {
    const query = normalizeSearchText(state.searchQuery);

    if (!query) return state.categories;

    return state.categories
        .map(function mapCategory(category) {
            const matchedItems = category.items.filter(function filterItem(item) {
                return matchesSearch(item, query);
            });

            return {
                key: category.key,
                title: category.title,
                description: category.description,
                fold: category.fold,
                // 在搜索时展开所有匹配到结果的分类，方便用户查看
                collapsed: false,
                items: matchedItems
            };
        })
        .filter(function filterCategory(category) {
            return category.items.length > 0;
        });
}

function normalizeItem(item, categoryTitle) {
    if (!item || typeof item !== "object") return null;

    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名";
    const url = typeof item.url === "string" ? item.url.trim() : "";
    const logo = typeof item.logo === "string" ? item.logo.trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";

    return {
        name: name,
        url: url,
        logo: logo,
        description: description,
        category: categoryTitle
    };
}

function normalizeCategories(rawData) {
    if (!Array.isArray(rawData)) return [];

    return rawData.map(function mapCategory(category, index) {
        const safeCategory = category && typeof category === "object" ? category : {};

        const title =
            typeof safeCategory.title === "string" && safeCategory.title.trim()
                ? safeCategory.title.trim()
                : "分类 " + (index + 1);

        const description =
            typeof safeCategory.description === "string" && safeCategory.description.trim()
                ? safeCategory.description.trim()
                : "";
        const defaultFold = Boolean(safeCategory.fold);

        const items = Array.isArray(safeCategory.items)
            ? safeCategory.items
                .map(function mapItem(item) {
                    return normalizeItem(item, title);
                })
                .filter(Boolean)
            : [];

        return {
            key: String(index),
            title: title,
            description: description,
            fold: defaultFold,
            collapsed: defaultFold,
            items: items
        };
    });
}

function normalizeGroupItem(item, categoryTitle) {
    if (!item || typeof item !== "object") return null;

    const name = typeof item.name === "string" && item.name.trim() ? item.name.trim() : "未命名群";
    const url = typeof item.url === "string" || typeof item.url === "number" ? String(item.url).trim() : "";
    const description = typeof item.description === "string" ? item.description.trim() : "";

    return {
        name: name,
        url: url,
        description: description,
        category: categoryTitle
    };
}

function normalizeGroupCategories(rawData) {
    if (!Array.isArray(rawData)) {
        return [];
    }

    return rawData.map(function mapGroupCategory(category, index) {
        const safeCategory = category && typeof category === "object" ? category : {};

        const title =
            typeof safeCategory.title === "string" && safeCategory.title.trim()
                ? safeCategory.title.trim()
                : "QQ群分类 " + (index + 1);

        const description =
            typeof safeCategory.description === "string" && safeCategory.description.trim()
                ? safeCategory.description.trim()
                : "";
        const defaultFold = Boolean(safeCategory.fold);

        const items = Array.isArray(safeCategory.items)
            ? safeCategory.items
                .map(function mapGroupItem(item) {
                    return normalizeGroupItem(item, title);
                })
                .filter(Boolean)
            : [];

        return {
            key: String(index),
            title: title,
            description: description,
            fold: defaultFold,
            collapsed: defaultFold,
            items: items
        };
    });
}

function normalizeImageItem(item, categoryTitle) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const title =
        typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : typeof item.name === "string" && item.name.trim()
                ? item.name.trim()
                : "未命名图片";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const url = typeof item.url === "string" ? item.url.trim() : "";

    return {
        title: title,
        description: description,
        url: url,
        category: categoryTitle
    };
}

function normalizeImageCategories(rawData) {
    if (!Array.isArray(rawData)) {
        return [];
    }

    return rawData.map(function mapImageCategory(category, index) {
        const safeCategory = category && typeof category === "object" ? category : {};

        const title =
            typeof safeCategory.title === "string" && safeCategory.title.trim()
                ? safeCategory.title.trim()
                : "图片分类 " + (index + 1);

        const description =
            typeof safeCategory.description === "string" && safeCategory.description.trim()
                ? safeCategory.description.trim()
                : "";
        const defaultFold = Boolean(safeCategory.fold);

        const items = Array.isArray(safeCategory.items)
            ? safeCategory.items
                .map(function mapImageItem(item) {
                    return normalizeImageItem(item, title);
                })
                .filter(Boolean)
            : [];

        return {
            key: String(index),
            title: title,
            description: description,
            fold: defaultFold,
            collapsed: defaultFold,
            items: items
        };
    });
}

function normalizeArticleItem(item, categoryTitle) {
    if (!item || typeof item !== "object") {
        return null;
    }

    const title =
        typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : typeof item.name === "string" && item.name.trim()
                ? item.name.trim()
                : "未命名教程";
    const description = typeof item.description === "string" ? item.description.trim() : "";
    const author = typeof item.author === "string" && item.author.trim() ? item.author.trim() : "未知作者";
    const url = typeof item.url === "string" ? item.url.trim() : "";

    return {
        title: title,
        description: description,
        author: author,
        url: url,
        category: categoryTitle
    };
}

function normalizeArticleCategories(rawData) {
    if (!Array.isArray(rawData)) {
        return [];
    }

    return rawData.map(function mapArticleCategory(category, index) {
        const safeCategory = category && typeof category === "object" ? category : {};

        const title =
            typeof safeCategory.title === "string" && safeCategory.title.trim()
                ? safeCategory.title.trim()
                : "教程分类 " + (index + 1);

        const description =
            typeof safeCategory.description === "string" && safeCategory.description.trim()
                ? safeCategory.description.trim()
                : "";
        const defaultFold = Boolean(safeCategory.fold);

        const items = Array.isArray(safeCategory.items)
            ? safeCategory.items
                .map(function mapArticleItem(item) {
                    return normalizeArticleItem(item, title);
                })
                .filter(Boolean)
            : [];

        return {
            key: String(index),
            title: title,
            description: description,
            fold: defaultFold,
            collapsed: defaultFold,
            items: items
        };
    });
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(state.unifiedFavorites));
}

function fetchDataBySources(sources) {
    return sources.reduce(function chainFetch(previousPromise, source) {
        return previousPromise.catch(function onError() {
            return fetch(source, { cache: "no-store" }).then(function onResponse(response) {
                if (!response.ok) {
                    throw new Error("Fetch failed for " + source + " with HTTP " + response.status);
                }

                return response.json();
            });
        });
    }, Promise.reject(new Error("Initial fetch failed")));
}

function normalizeCategoryReferencePath(pathValue) {
    if (typeof pathValue !== "string") {
        return "";
    }

    const trimmed = pathValue.trim().replace(/\\/g, "/");
    if (!trimmed) {
        return "";
    }

    return trimmed.replace(/^\.?\/+/, "");
}

function getCategoryReferenceSources(referencePath) {
    const normalizedPath = normalizeCategoryReferencePath(referencePath);
    if (!normalizedPath) {
        return [];
    }

    if (normalizedPath.indexOf("data/category/") === 0) {
        return ["/" + normalizedPath, "./" + normalizedPath];
    }

    return ["/data/category/" + normalizedPath, "./data/category/" + normalizedPath];
}

function normalizeReferencedCategoryPayload(payload, referencePath) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && typeof payload === "object") {
        return [payload];
    }

    console.warn("分类引用内容无效，已忽略:", referencePath);
    return [];
}

function flattenCategoryChunks(chunks) {
    return chunks.reduce(function reduceChunk(acc, chunk) {
        return acc.concat(chunk);
    }, []);
}

function resolveCategoryReferences(rawData, visitedReferences) {
    if (!Array.isArray(rawData)) {
        return Promise.resolve([]);
    }

    const visited = visitedReferences instanceof Set ? visitedReferences : new Set();

    const tasks = rawData.map(function mapEntry(entry) {
        if (typeof entry !== "string") {
            return Promise.resolve([entry]);
        }

        const normalizedPath = normalizeCategoryReferencePath(entry);
        if (!normalizedPath) {
            return Promise.resolve([]);
        }

        if (visited.has(normalizedPath)) {
            console.warn("检测到重复或循环分类引用，已跳过:", normalizedPath);
            return Promise.resolve([]);
        }

        visited.add(normalizedPath);

        return fetchDataBySources(getCategoryReferenceSources(normalizedPath))
            .then(function onReferenceLoaded(payload) {
                const referencedEntries = normalizeReferencedCategoryPayload(payload, normalizedPath);
                return resolveCategoryReferences(referencedEntries, visited);
            })
            .catch(function onReferenceError(error) {
                console.warn("加载分类引用失败，已跳过:", normalizedPath, error);
                return [];
            });
    });

    return Promise.all(tasks).then(flattenCategoryChunks);
}

function fetchNavigationData() {
    return fetchDataBySources(WEBSITE_DATA_SOURCES)
        .then(resolveCategoryReferences)
        .then(normalizeCategories);
}

function fetchGroupData() {
    return fetchDataBySources(GROUP_DATA_SOURCES)
        .then(resolveCategoryReferences)
        .then(normalizeGroupCategories);
}

function fetchImageData() {
    return fetchDataBySources(IMAGE_DATA_SOURCES)
        .then(resolveCategoryReferences)
        .then(normalizeImageCategories);
}

function fetchArticleData() {
    return fetchDataBySources(ARTICLE_DATA_SOURCES)
        .then(resolveCategoryReferences)
        .then(normalizeArticleCategories);
}

// --- unified favorites helpers (支持跨类型的统一收藏顺序与拖拽) ---
function getFavoriteKeyForUnified(item, type) {
    if (!type) return "";

    switch (type) {
        case "website":
            return "website|" + (item && item.url ? item.url : "");
        case "group":
            return "group|" + (item && item.url ? item.url : "");
        case "image":
            return (
                "image|" + (item && item.category ? item.category : "") + "|" + (item && item.title ? item.title : "")
            );
        case "article":
            return (
                "article|" +
                (item && item.category ? item.category : "") +
                "|" +
                (item && item.title ? item.title : "") +
                "|" +
                (item && item.author ? item.author : "")
            );
        default:
            return "";
    }
}

function getFilteredGroupCategories() {
    const query = normalizeSearchText(state.searchQuery);
    if (!query) return state.groupCategories;

    return state.groupCategories
        .map(function mapCategory(category) {
            const matchedItems = category.items.filter(function filterItem(item) {
                return matchesSearch(item, query);
            });

            return {
                key: category.key,
                title: category.title,
                description: category.description,
                fold: category.fold,
                // 搜索时展开匹配分类
                collapsed: false,
                items: matchedItems
            };
        })
        .filter(function filterCategory(category) {
            return category.items.length > 0;
        });
}

function getFilteredImageCategories() {
    const query = normalizeSearchText(state.searchQuery);
    if (!query) return state.imageCategories;

    return state.imageCategories
        .map(function mapCategory(category) {
            const matchedItems = category.items.filter(function filterItem(item) {
                return matchesSearch(item, query);
            });

            return {
                key: category.key,
                title: category.title,
                description: category.description,
                fold: category.fold,
                // 搜索时展开匹配分类
                collapsed: false,
                items: matchedItems
            };
        })
        .filter(function filterCategory(category) {
            return category.items.length > 0;
        });
}

function getFilteredArticleCategories() {
    const query = normalizeSearchText(state.searchQuery);
    if (!query) return state.articleCategories;

    return state.articleCategories
        .map(function mapCategory(category) {
            const matchedItems = category.items.filter(function filterItem(item) {
                return matchesSearch(item, query);
            });

            return {
                key: category.key,
                title: category.title,
                description: category.description,
                fold: category.fold,
                // 搜索时展开匹配分类
                collapsed: false,
                items: matchedItems
            };
        })
        .filter(function filterCategory(category) {
            return category.items.length > 0;
        });
}

function addToUnifiedFavorites(url, type) {
    removeFromUnifiedFavorites(url);
    state.unifiedFavorites.push({ type, url });
    saveFavorites();
}

function removeFromUnifiedFavorites(url) {
    state.unifiedFavorites = state.unifiedFavorites.filter(e => e.url !== url);
    saveFavorites();
}

function reorderUnifiedFavorites(sourceUrl, targetUrl, insertBefore) {
    if (!sourceUrl || !targetUrl || sourceUrl === targetUrl) return;

    const srcIndex = state.unifiedFavorites.findIndex(function (e) {
        return e.url === sourceUrl;
    });

    let tgtIndex = state.unifiedFavorites.findIndex(function (e) {
        return e.url === targetUrl;
    });

    if (srcIndex === -1 || tgtIndex === -1) return;

    const moved = state.unifiedFavorites.splice(srcIndex, 1)[0];

    if (srcIndex < tgtIndex) tgtIndex -= 1;

    const insertIndex = insertBefore ? tgtIndex : tgtIndex + 1;
    state.unifiedFavorites.splice(insertIndex, 0, moved);

    renderFavorites();
}

function moveUnifiedFavoriteToEnd(sourceKey) {
    const srcIndex = state.unifiedFavorites.findIndex(function (e) {
        return getFavoriteKeyForUnified(e.item, e.type) === sourceKey;
    });

    if (srcIndex === -1 || srcIndex === state.unifiedFavorites.length - 1) return;

    const moved = state.unifiedFavorites.splice(srcIndex, 1)[0];
    state.unifiedFavorites.push(moved);
    renderFavorites();
}

function enableFavoriteDragGeneric(card, item, type) {
    if (!card) return;

    const key = item.url;
    card.classList.add("draggable-card");
    card.draggable = true;

    card.addEventListener("dragstart", function onDragStart(event) {
        dragState.draggingKey = key;
        card.classList.add("dragging");

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", key);
        }
    });

    card.addEventListener("dragover", function onDragOver(event) {
        if (!dragState.draggingKey || dragState.draggingKey === key) {
            return;
        }

        event.preventDefault();
        clearFavoriteDragStyles();

        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + rect.height / 2;
        card.classList.add(insertBefore ? "drag-over-top" : "drag-over-bottom");

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    });

    card.addEventListener("dragleave", function onDragLeave(event) {
        if (event.relatedTarget && card.contains(event.relatedTarget)) {
            return;
        }

        card.classList.remove("drag-over-top", "drag-over-bottom");
    });

    card.addEventListener("drop", function onDrop(event) {
        if (!dragState.draggingKey || dragState.draggingKey === key) {
            return;
        }

        event.preventDefault();

        const rect = card.getBoundingClientRect();
        const insertBefore = event.clientY < rect.top + rect.height / 2;

        reorderUnifiedFavorites(dragState.draggingKey, key, insertBefore);
        dragState.draggingKey = "";
        dragState.suppressClickUntil = Date.now() + 250;
    });

    card.addEventListener("dragend", function onDragEnd() {
        card.classList.remove("dragging");
        dragState.draggingKey = "";
        clearFavoriteDragStyles();
    });
}


function getSectionId(prefix, index) {
    return prefix + "-section-" + index;
}

function isFavorited(url) {
    return state.unifiedFavorites.some(e => e.url === url);
}

function setFavoriteButtonState(button, url) {
    const active = isFavorited(url);
    button.classList.toggle("active", active);
    button.textContent = active ? "★" : "☆";
    button.setAttribute("aria-pressed", String(active));
    button.title = active ? "移出收藏夹" : "加入收藏夹";
}

function openCardLink(url) {
    if (!url) {
        return;
    }

    if (typeof window.openInNewPage === "function") {
        openInNewPage(url);
        return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
}

function toggleFavorite(item, type) {
    if (isFavorited(item.url)) removeFromUnifiedFavorites(item.url);
    else addToUnifiedFavorites(item.url, type);
    renderFavorites();
}

function clearFavoriteDragStyles() {
    const styledCards = refs.favoritesGrid.querySelectorAll(".drag-over-top, .drag-over-bottom");

    styledCards.forEach(function forEachStyledCard(card) {
        card.classList.remove("drag-over-top", "drag-over-bottom");
    });
}

function createWebsiteCard(item, options) {
    const showCategory = Boolean(options && options.showCategory);
    const activeQuery = normalizeSearchText(state.searchQuery);

    const card = document.createElement("article");
    card.className = "nav-card";

    if (!item.url) {
        card.classList.add("disabled");
    }

    card.tabIndex = item.url ? 0 : -1;
    card.setAttribute("role", "button");

    if (item.logo) {
        const iconWrap = document.createElement("div");
        iconWrap.className = "card-icon";

        const icon = document.createElement("img");
        icon.src = item.logo;
        icon.alt = item.name + " 图标";
        icon.loading = "lazy";
        icon.addEventListener("error", function onIconError() {
            iconWrap.remove();
        });

        iconWrap.appendChild(icon);
        card.appendChild(iconWrap);
    }

    const name = document.createElement("p");
    name.className = "card-name";
    setHighlightedText(name, item.name, activeQuery);
    card.appendChild(name);

    if (activeQuery && normalizeSearchText(item.url).includes(activeQuery)) {
        const urlLine = document.createElement("p");
        urlLine.className = "card-url";
        setHighlightedText(urlLine, item.url, activeQuery);
        card.appendChild(urlLine);
    }

    if (item.description) {
        const description = document.createElement("div");
        description.className = "card-description-overlay";
        setHighlightedText(description, item.description, activeQuery);
        card.appendChild(description);
    }

    if (showCategory && item.category) {
        const category = document.createElement("p");
        category.className = "card-category";
        category.textContent = item.category;
        card.appendChild(category);
    }

    if (item.url) {
        card.addEventListener("click", function onCardClick() {
            if (Date.now() < dragState.suppressClickUntil) {
                return;
            }

            openCardLink(item.url);
        });

        card.addEventListener("keydown", function onCardKeydown(event) {
            if (event.target !== card) {
                return;
            }

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCardLink(item.url);
            }
        });

        const favoriteButton = document.createElement("button");
        favoriteButton.type = "button";
        favoriteButton.className = "favorite-toggle";

        setFavoriteButtonState(favoriteButton, item.url);

        favoriteButton.addEventListener("click", function onFavoriteClick(event) {
            event.stopPropagation();
            toggleFavorite(item, "website");
            renderCategoriesArea();
        });

        card.appendChild(favoriteButton);
    }

    return card;
}

function copyToClipboard(text) {
    if (!text) {
        return Promise.reject(new Error("Empty text"));
    }

    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text);
    }

    return new Promise(function fallbackCopy(resolve, reject) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.setAttribute("readonly", "");
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        textArea.style.pointerEvents = "none";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            const copied = document.execCommand("copy");
            document.body.removeChild(textArea);

            if (copied) {
                resolve();
            } else {
                reject(new Error("copy command failed"));
            }
        } catch (error) {
            document.body.removeChild(textArea);
            reject(error);
        }
    });
}

function createGroupCard(groupItem) {
    const card = document.createElement("article");
    card.className = "qq-card";


    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-toggle group-favorite-toggle";
    setFavoriteButtonState(favoriteButton, groupItem.url);
    favoriteButton.addEventListener("click", function onGroupFavoriteClick(event) {
        event.preventDefault();
        event.stopPropagation();

        if (favoriteButton.disabled) return;

        toggleFavorite(groupItem, "group");
        renderGroupCategoriesArea();
    });

    if (!groupItem.url) {
        favoriteButton.disabled = true;
        favoriteButton.title = "无群号不可收藏";
    }

    const top = document.createElement("div");
    top.className = "qq-card-top";

    const name = document.createElement("h3");
    name.className = "qq-name";
    setHighlightedText(name, groupItem.name || "未命名群", state.searchQuery);
    top.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "qq-meta";

    const qqNumber = document.createElement("span");
    qqNumber.className = "qq-number";
    setHighlightedText(qqNumber, groupItem.url || "未提供群号", state.searchQuery);
    meta.appendChild(qqNumber);

    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "qq-copy-btn";
    copyButton.title = "复制群号";
    copyButton.setAttribute("aria-label", "复制群号");

    const copyIcon = document.createElement("img");
    copyIcon.src = COPY_ICON_PATH;
    copyIcon.alt = "";
    copyIcon.loading = "lazy";
    copyButton.appendChild(copyIcon);

    const copyText = document.createElement("span");
    copyText.textContent = "复制";
    copyButton.appendChild(copyText);

    if (!groupItem.url) {
        copyButton.disabled = true;
    }

    copyButton.addEventListener("click", function onCopyClick(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!groupItem.url || copyButton.disabled) {
            return;
        }

        copyToClipboard(groupItem.url)
            .then(function onCopied() {
                copyButton.classList.add("copied");
                copyButton.title = "已复制";

                setTimeout(function clearCopiedState() {
                    copyButton.classList.remove("copied");
                    copyButton.title = "复制群号";
                }, 1200);
            })
            .catch(function onCopyError(error) {
                console.warn("复制群号失败", error);
            });
    });

    const actions = document.createElement("div");
    actions.className = "qq-actions";
    actions.appendChild(copyButton);
    actions.appendChild(favoriteButton);

    meta.appendChild(actions);
    top.appendChild(meta);
    card.appendChild(top);

    const description = document.createElement("p");
    description.className = "qq-description";
    setHighlightedText(description, groupItem.description || "暂无介绍", state.searchQuery);
    card.appendChild(description);

    return card;
}

function createImageCard(imageItem) {
    const card = document.createElement("article");
    card.className = "image-card";
    card.setAttribute("role", "button");

    if (!imageItem.url) {
        card.classList.add("disabled");
        card.tabIndex = -1;
    } else {
        card.tabIndex = 0;
        card.addEventListener("click", function onCardClick() {
            if (Date.now() < dragState.suppressClickUntil) {
                return;
            }

            openCardLink(imageItem.url);
        });

        card.addEventListener("keydown", function onCardKeydown(event) {
            if (event.target !== card) return;
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCardLink(imageItem.url);
            }
        });
    }

    const top = document.createElement("div");
    top.className = "info-card-top";

    const title = document.createElement("h3");
    title.className = "info-card-title";
    setHighlightedText(title, imageItem.title || "未命名图片", state.searchQuery);
    top.appendChild(title);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-toggle info-favorite-toggle";
    setFavoriteButtonState(favoriteButton, imageItem.url);
    favoriteButton.addEventListener("click", function onImageFavoriteClick(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(imageItem, "image");
        renderImageCategoriesArea();
    });
    top.appendChild(favoriteButton);

    card.appendChild(top);

    const description = document.createElement("p");
    description.className = "info-card-description";
    setHighlightedText(description, imageItem.description || "暂无介绍", state.searchQuery);
    card.appendChild(description);

    return card;
}

function createArticleCard(articleItem) {
    const card = document.createElement("article");
    card.className = "article-card";
    card.setAttribute("role", "button");

    if (!articleItem.url) {
        card.classList.add("disabled");
        card.tabIndex = -1;
    } else {
        card.tabIndex = 0;
        card.addEventListener("click", function onCardClick() {
            if (Date.now() < dragState.suppressClickUntil) {
                return;
            }

            openCardLink(articleItem.url);
        });

        card.addEventListener("keydown", function onCardKeydown(event) {
            if (event.target !== card) {
                return;
            }

            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openCardLink(articleItem.url);
            }
        });
    }


    const top = document.createElement("div");
    top.className = "info-card-top";

    const title = document.createElement("h3");
    title.className = "info-card-title";
    setHighlightedText(title, articleItem.title || "未命名教程", state.searchQuery);
    top.appendChild(title);

    const favoriteButton = document.createElement("button");
    favoriteButton.type = "button";
    favoriteButton.className = "favorite-toggle info-favorite-toggle";
    setFavoriteButtonState(favoriteButton, articleItem.url);
    favoriteButton.addEventListener("click", function onArticleFavoriteClick(event) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(articleItem, "article");
        renderArticleCategoriesArea();
    });
    top.appendChild(favoriteButton);

    card.appendChild(top);

    const description = document.createElement("p");
    description.className = "info-card-description";
    setHighlightedText(description, articleItem.description || "暂无介绍", state.searchQuery);
    card.appendChild(description);

    const author = document.createElement("p");
    author.className = "article-author";
    const authorLabel = document.createElement("span");
    authorLabel.className = "author-label";
    authorLabel.textContent = "作者：";
    const authorName = document.createElement("span");
    authorName.className = "author-name";
    setHighlightedText(authorName, articleItem.author || "未知作者", state.searchQuery);
    author.appendChild(authorLabel);
    author.appendChild(authorName);
    card.appendChild(author);

    return card;
}

function setupFavoritesDropZone() {
    refs.favoritesGrid.addEventListener("dragover", function onGridDragOver(event) {
        if (!dragState.draggingKey || event.target !== refs.favoritesGrid) {
            return;
        }

        event.preventDefault();

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }

        clearFavoriteDragStyles();
    });

    refs.favoritesGrid.addEventListener("drop", function onGridDrop(event) {
        if (!dragState.draggingKey || event.target !== refs.favoritesGrid) {
            return;
        }

        event.preventDefault();
        moveUnifiedFavoriteToEnd(dragState.draggingKey);
        dragState.draggingKey = "";
        dragState.suppressClickUntil = Date.now() + 250;
    });
}

function setActiveCategory(sectionId) {
    const buttons = document.querySelectorAll(".sidebar .category-link");

    buttons.forEach(function forEachButton(button) {
        button.classList.toggle("active", Boolean(sectionId) && button.dataset.targetId === sectionId);
    });
}

function createSidebarNavButton(listElement, text, sectionId) {
    const listItem = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-link";
    button.textContent = text;
    button.dataset.targetId = sectionId;

    button.addEventListener("click", function onCategoryClick() {
        const target = document.getElementById(sectionId);

        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            setActiveCategory(sectionId);
        }
    });

    listItem.appendChild(button);
    listElement.appendChild(listItem);
}

function renderNavList(listElement, categories, prefix, emptyText) {
    if (!listElement) {
        return;
    }

    listElement.innerHTML = "";

    if (categories.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "nav-empty-item";
        emptyItem.textContent = emptyText;
        listElement.appendChild(emptyItem);
        return;
    }

    categories.forEach(function forEachCategory(category, index) {
        const categoryKey = category && category.key != null ? category.key : String(index);
        const sectionId = getSectionId(prefix, categoryKey);
        createSidebarNavButton(listElement, category.title, sectionId);
    });
}

function renderFavoritesSidebar() {
    if (!refs.favoritesNavList) {
        return;
    }

    refs.favoritesNavList.innerHTML = "";
    // 合并为单一收藏入口
    createSidebarNavButton(refs.favoritesNavList, "收藏夹", FAVORITES_SECTION_ID);
}

function renderWebsiteSidebar(categoriesForView) {
    renderNavList(refs.navList, categoriesForView, WEBSITE_SECTION_PREFIX, "无匹配网站分类");
}

function renderGroupSidebar() {
    renderNavList(refs.groupNavList, state.groupCategories, GROUP_SECTION_PREFIX, "暂无QQ群分类");
}

function renderImageSidebar() {
    renderNavList(refs.imageNavList, state.imageCategories, IMAGE_SECTION_PREFIX, "暂无图片分类");
}

function renderArticleSidebar() {
    renderNavList(refs.articleNavList, state.articleCategories, ARTICLE_SECTION_PREFIX, "暂无教程分类");
}

function setupScrollSpy() {
    if (sectionObserver) {
        sectionObserver.disconnect();
    }

    sectionObserver = new IntersectionObserver(
        function onIntersect(entries) {
            entries.forEach(function forEachEntry(entry) {
                if (entry.isIntersecting) {
                    setActiveCategory(entry.target.id);
                }
            });
        },
        {
            root: refs.contentPane,
            rootMargin: "-35% 0px -55% 0px",
            threshold: 0
        }
    );

    const sections = refs.contentPane.querySelectorAll(
        "#" + FAVORITES_SECTION_ID +
        ", .category-section[id], .group-category-section[id], .image-category-section[id], .article-category-section[id]"
    );
    sections.forEach(function forEachSection(section) {
        sectionObserver.observe(section);
    });

    if (sections[0]) {
        setActiveCategory(sections[0].id);
        return;
    }

    setActiveCategory("");
}

function toggleWebsiteCategoryFold(categoryKey) {
    const category = state.categories.find(function findCategory(item) {
        return item.key === categoryKey;
    });

    if (!category) {
        return;
    }

    category.collapsed = !category.collapsed;
    renderCategoriesArea();
}

function toggleGroupCategoryFold(categoryKey) {
    const category = state.groupCategories.find(function findCategory(item) {
        return item.key === categoryKey;
    });

    if (!category) {
        return;
    }

    category.collapsed = !category.collapsed;
    renderGroupCategoriesArea();
}

function toggleImageCategoryFold(categoryKey) {
    const category = state.imageCategories.find(function findCategory(item) {
        return item.key === categoryKey;
    });

    if (!category) {
        return;
    }

    category.collapsed = !category.collapsed;
    renderImageCategoriesArea();
}

function toggleArticleCategoryFold(categoryKey) {
    const category = state.articleCategories.find(function findCategory(item) {
        return item.key === categoryKey;
    });

    if (!category) {
        return;
    }

    category.collapsed = !category.collapsed;
    renderArticleCategoriesArea();
}

function createCategorySectionHead(category, countText, onToggleFold) {
    const head = document.createElement("div");
    head.className = "section-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "section-title-wrap";

    const title = document.createElement("h2");
    title.textContent = category.title;
    titleWrap.appendChild(title);

    if (category.description) {
        const description = document.createElement("p");
        description.className = "section-description";
        description.textContent = category.description;
        titleWrap.appendChild(description);
    }

    const actions = document.createElement("div");
    actions.className = "section-actions";

    const count = document.createElement("span");
    count.className = "item-count";
    count.textContent = countText;

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "category-fold-toggle";
    toggleButton.textContent = category.collapsed ? "展开" : "折叠";
    toggleButton.setAttribute("aria-expanded", String(!category.collapsed));
    toggleButton.addEventListener("click", function onFoldClick(event) {
        event.preventDefault();
        event.stopPropagation();
        onToggleFold();
    });

    actions.appendChild(count);
    actions.appendChild(toggleButton);

    head.appendChild(titleWrap);
    head.appendChild(actions);

    return head;
}

function createTypeHead(title) {
    const section = document.createElement("section");
    section.className = 'category-section';
    const h2 = document.createElement('h2');
    h2.style.margin = '0px';
    h2.innerText = title;
    section.appendChild(h2);
    return section;
}

function renderCategorySections(categoriesForView) {
    refs.categoriesContainer.innerHTML = '';
    refs.categoriesContainer.appendChild(createTypeHead('网站'));

    if (categoriesForView.length === 0) {
        const noMatch = document.createElement("p");
        noMatch.className = "empty-state";
        noMatch.textContent = "未找到匹配内容。";
        refs.categoriesContainer.appendChild(noMatch);
        setupScrollSpy();
        return;
    }

    categoriesForView.forEach(function forEachCategory(category, index) {
        const categoryKey = category && category.key != null ? category.key : String(index);

        const section = document.createElement("section");
        section.className = "category-section";
        section.id = getSectionId(WEBSITE_SECTION_PREFIX, categoryKey);

        const head = createCategorySectionHead(category, category.items.length + " 个链接", function onToggle() {
            toggleWebsiteCategoryFold(categoryKey);
        });

        section.appendChild(head);

        if (category.collapsed) {
            section.classList.add("is-collapsed");
            refs.categoriesContainer.appendChild(section);
            return;
        }

        const body = document.createElement("div");
        body.className = "section-body";

        if (category.items.length === 0) {
            const empty = document.createElement("p");
            empty.className = "empty-state";
            empty.textContent = "该分类暂时没有链接。";
            body.appendChild(empty);
        } else {
            const grid = document.createElement("div");
            grid.className = "card-grid";

            category.items.forEach(function forEachItem(item) {
                grid.appendChild(createWebsiteCard(item, { showCategory: false, enableDrag: false }));
            });

            body.appendChild(grid);
        }

        section.appendChild(body);

        refs.categoriesContainer.appendChild(section);
    });

    setupScrollSpy();
}

function renderCategoriesArea() {
    const categoriesForView = getFilteredCategories();
    renderWebsiteSidebar(categoriesForView);
    renderCategorySections(categoriesForView);
}

function renderGroupCategorySections() {
    // 接受预过滤后的分类数组（方便搜索时只显示匹配项）
    refs.groupCategoriesContainer.innerHTML = '';
    refs.groupCategoriesContainer.appendChild(createTypeHead('QQ群'));

    if (!Array.isArray(arguments[0]) || arguments[0].length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "暂无QQ群内容。";
        refs.groupCategoriesContainer.appendChild(empty);
        setupScrollSpy();
        return;
    }

    const categoriesForView = arguments[0];

    categoriesForView.forEach(function forEachGroupCategory(category, index) {
        const categoryKey = category && category.key != null ? category.key : String(index);

        const section = document.createElement("section");
        section.className = "group-category-section";
        section.id = getSectionId(GROUP_SECTION_PREFIX, categoryKey);

        const head = createCategorySectionHead(category, category.items.length + " 个QQ群", function onToggle() {
            toggleGroupCategoryFold(categoryKey);
        });

        section.appendChild(head);

        if (category.collapsed) {
            section.classList.add("is-collapsed");
            refs.groupCategoriesContainer.appendChild(section);
            return;
        }

        const body = document.createElement("div");
        body.className = "section-body";

        if (category.items.length === 0) {
            const categoryEmpty = document.createElement("p");
            categoryEmpty.className = "empty-state";
            categoryEmpty.textContent = "该分类暂时没有QQ群。";
            body.appendChild(categoryEmpty);
        } else {
            const grid = document.createElement("div");
            grid.className = "card-grid group-card-grid";

            category.items.forEach(function forEachGroupItem(groupItem) {
                grid.appendChild(createGroupCard(groupItem));
            });

            body.appendChild(grid);
        }

        section.appendChild(body);

        refs.groupCategoriesContainer.appendChild(section);
    });

    setupScrollSpy();
}

function renderGroupCategoriesArea() {
    const categoriesForView = getFilteredGroupCategories();
    renderNavList(refs.groupNavList, categoriesForView, GROUP_SECTION_PREFIX, "暂无QQ群分类");
    renderGroupCategorySections(categoriesForView);
}

function renderImageCategorySections() {
    // 支持接收过滤过的分类列表（用于搜索）
    refs.imageCategoriesContainer.innerHTML = '';
    refs.imageCategoriesContainer.appendChild(createTypeHead('图片'));

    if (!Array.isArray(arguments[0]) || arguments[0].length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "暂无图片内容。";
        refs.imageCategoriesContainer.appendChild(empty);
        setupScrollSpy();
        return;
    }

    const categoriesForView = arguments[0];

    categoriesForView.forEach(function forEachImageCategory(category, index) {
        const categoryKey = category && category.key != null ? category.key : String(index);

        const section = document.createElement("section");
        section.className = "image-category-section";
        section.id = getSectionId(IMAGE_SECTION_PREFIX, categoryKey);

        const head = createCategorySectionHead(category, category.items.length + " 张图片", function onToggle() {
            toggleImageCategoryFold(categoryKey);
        });

        section.appendChild(head);

        if (category.collapsed) {
            section.classList.add("is-collapsed");
            refs.imageCategoriesContainer.appendChild(section);
            return;
        }

        const body = document.createElement("div");
        body.className = "section-body";

        if (category.items.length === 0) {
            const categoryEmpty = document.createElement("p");
            categoryEmpty.className = "empty-state";
            categoryEmpty.textContent = "该分类暂时没有图片。";
            body.appendChild(categoryEmpty);
        } else {
            const grid = document.createElement("div");
            grid.className = "card-grid image-card-grid";

            category.items.forEach(function forEachImageItem(imageItem) {
                grid.appendChild(createImageCard(imageItem));
            });

            body.appendChild(grid);
        }

        section.appendChild(body);
        refs.imageCategoriesContainer.appendChild(section);
    });

    setupScrollSpy();
}

function renderImageCategoriesArea() {
    const categoriesForView = getFilteredImageCategories();
    renderNavList(refs.imageNavList, categoriesForView, IMAGE_SECTION_PREFIX, "暂无图片分类");
    renderImageCategorySections(categoriesForView);
}

function renderArticleCategorySections() {
    // 支持接收过滤过的分类数组（用于搜索）
    refs.articleCategoriesContainer.innerHTML = '';
    refs.articleCategoriesContainer.appendChild(createTypeHead('教程'));

    if (!Array.isArray(arguments[0]) || arguments[0].length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "暂无教程内容。";
        refs.articleCategoriesContainer.appendChild(empty);
        setupScrollSpy();
        return;
    }

    const categoriesForView = arguments[0];

    categoriesForView.forEach(function forEachArticleCategory(category, index) {
        const categoryKey = category && category.key != null ? category.key : String(index);

        const section = document.createElement("section");
        section.className = "article-category-section";
        section.id = getSectionId(ARTICLE_SECTION_PREFIX, categoryKey);

        const head = createCategorySectionHead(category, category.items.length + " 篇教程", function onToggle() {
            toggleArticleCategoryFold(categoryKey);
        });

        section.appendChild(head);

        if (category.collapsed) {
            section.classList.add("is-collapsed");
            refs.articleCategoriesContainer.appendChild(section);
            return;
        }

        const body = document.createElement("div");
        body.className = "section-body";

        if (category.items.length === 0) {
            const categoryEmpty = document.createElement("p");
            categoryEmpty.className = "empty-state";
            categoryEmpty.textContent = "该分类暂时没有教程。";
            body.appendChild(categoryEmpty);
        } else {
            const grid = document.createElement("div");
            grid.className = "card-grid article-card-grid";

            category.items.forEach(function forEachArticleItem(articleItem) {
                grid.appendChild(createArticleCard(articleItem));
            });

            body.appendChild(grid);
        }

        section.appendChild(body);
        refs.articleCategoriesContainer.appendChild(section);
    });

    setupScrollSpy();
}

function renderArticleCategoriesArea() {
    const categoriesForView = getFilteredArticleCategories();
    renderNavList(refs.articleNavList, categoriesForView, ARTICLE_SECTION_PREFIX, "暂无教程分类");
    renderArticleCategorySections(categoriesForView);
}

function setupSearch() {
    if (!refs.searchInput) {
        return;
    }

    refs.searchInput.addEventListener("input", function onSearchInput(event) {
        state.searchQuery = event.target.value || "";
        renderCategoriesArea();
        renderGroupCategoriesArea();
        renderImageCategoriesArea();
        renderArticleCategoriesArea();
    });
}

function renderFavorites() {
    refs.favoritesGrid.innerHTML = "";

    if (state.unifiedFavorites.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "点击卡片右上角星标即可加入收藏夹。";
        refs.favoritesGrid.appendChild(empty);
        return;
    }

    state.unifiedFavorites.forEach(function (entry) {
        const type = entry.type;
        const item = state.itemByName[entry.url];

        if (type === "website") {
            const cardW = createWebsiteCard(item);
            refs.favoritesGrid.appendChild(cardW);
            enableFavoriteDragGeneric(cardW, item, "website");
        } else if (type === "group") {
            const cardG = createGroupCard(item);
            refs.favoritesGrid.appendChild(cardG);
            enableFavoriteDragGeneric(cardG, item, "group");
        } else if (type === "image") {
            const cardI = createImageCard(item);
            refs.favoritesGrid.appendChild(cardI);
            enableFavoriteDragGeneric(cardI, item, "image");
        } else if (type === "article") {
            const cardA = createArticleCard(item);
            refs.favoritesGrid.appendChild(cardA);
            enableFavoriteDragGeneric(cardA, item, "article");
        }
    });
}

function renderLoadingState() {
    refs.favoritesGrid.innerHTML = '<p class="loading-state">正在加载收藏夹...</p>';
    refs.categoriesContainer.innerHTML = '<p class="loading-state">正在加载分类...</p>';
    refs.groupCategoriesContainer.innerHTML = '<p class="loading-state">正在加载QQ群...</p>';
    refs.imageCategoriesContainer.innerHTML = '<p class="loading-state">正在加载图片...</p>';
    refs.articleCategoriesContainer.innerHTML = '<p class="loading-state">正在加载教程...</p>';
}

function renderErrorState(div, message) {
    div.innerHTML = "";
    const error = document.createElement("p");
    error.className = "error-state";
    error.textContent = message;
    div.appendChild(error);
    setupScrollSpy();
}

function init() {
    renderLoadingState();
    state.unifiedFavorites = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    renderFavoritesSidebar();

    let websiteErrorMessage = "";
    let groupErrorMessage = "";
    let imageErrorMessage = "";
    let articleErrorMessage = "";

    Promise.all([
        fetchNavigationData().catch(err => {
            console.error(err);
            websiteErrorMessage = "加载 /data/websites.json 失败，请检查文件路径和 JSON 格式。";
            return [];
        }),
        fetchGroupData().catch(err => {
            console.error(err);
            groupErrorMessage = "加载 /data/groups.json 失败，请检查文件路径和 JSON 格式。";
            return [];
        }),
        fetchImageData().catch(err => {
            console.error(err);
            imageErrorMessage = "加载 /data/images.json 失败，请检查文件路径和 JSON 格式。";
            return [];
        }),
        fetchArticleData().catch(err => {
            console.error(err);
            articleErrorMessage = "加载 /data/articles.json 失败，请检查文件路径和 JSON 格式。";
            return [];
        })
    ]).then(results => {
        state.categories = results[0];
        state.groupCategories = results[1];
        state.imageCategories = results[2];
        state.articleCategories = results[3];

        state.itemByName = {}
        results[0].flatMap(x => x.items).forEach(item => state.itemByName[item.url] = item)
        //FIXME::Normalize QQ key
        results[1].flatMap(x => x.items).forEach(item => state.itemByName[item.url] = item)
        results[2].flatMap(x => x.items).forEach(item => state.itemByName[item.url] = item)
        results[3].flatMap(x => x.items).forEach(item => state.itemByName[item.url] = item)

        renderFavorites();
        renderCategoriesArea();
        renderGroupCategoriesArea();
        renderImageCategoriesArea();
        renderArticleCategoriesArea();

        if (websiteErrorMessage) renderErrorState(refs.categoriesContainer, websiteErrorMessage);
        if (groupErrorMessage) renderErrorState(refs.groupCategoriesContainer, groupErrorMessage);
        if (imageErrorMessage) renderErrorState(refs.imageCategoriesContainer, imageErrorMessage);
        if (articleErrorMessage) renderErrorState(refs.articleCategoriesContainer, articleErrorMessage);
    });
}

setupFavoritesDropZone();
setupSearch();
init();
