import { openInNewPage, openNetworkConnectPage } from "./open-link.js";

const INDEX_DATA_SOURCES = ["/data/index.json", "./data/index.json"];
const FAVORITES_KEY = "shunav:favorites";
const SECTION_PREFIX = "section";
const FAVORITES_SECTION_ID = "favoritesSection";
const COPY_ICON_PATH = "img/icon/icon-copy.svg";

const state = {
    sections: [],           // Array of { title, logo, key, categories: [...] }
    sectionConfigs: [],     // Raw index.json entries
    itemByName: {},
    unifiedFavorites: [],
    searchQuery: ""
};

const refs = {
    favoritesNavList: document.getElementById("favoritesNavList"),
    dynamicNavContainer: document.getElementById("dynamicNavContainer"),
    contentPane: document.getElementById("contentPane"),
    favoritesGrid: document.getElementById("favoritesGrid"),
    categoriesContainer: document.getElementById("categoriesContainer"),
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

function getFilteredSections() {
    const query = normalizeSearchText(state.searchQuery);

    if (!query) return state.sections;

    return state.sections
        .map(function mapSection(section) {
            const matchedCategories = section.categories
                .map(function mapCategory(category) {
                    const matchedItems = category.items.filter(function filterItem(item) {
                        return matchesSearch(item, query);
                    });

                    return {
                        key: category.key,
                        title: category.title,
                        description: category.description,
                        fold: category.fold,
                        collapsed: false,
                        items: matchedItems
                    };
                })
                .filter(function filterCategory(category) {
                    return category.items.length > 0;
                });

            return {
                title: section.title,
                logo: section.logo,
                key: section.key,
                categories: matchedCategories
            };
        })
        .filter(function filterSection(section) {
            return section.categories.length > 0;
        });
}

function normalizeSectionItem(item, categoryTitle) {
    if (!item || typeof item !== "object") return null;

    const name = typeof item.name === "string" && item.name.trim()
        ? item.name.trim()
        : (typeof item.title === "string" && item.title.trim()
            ? item.title.trim()
            : "未命名");

    const url = typeof item.url === "string" || typeof item.url === "number"
        ? String(item.url).trim()
        : "";

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

function normalizeSectionCategories(rawData) {
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
                    return normalizeSectionItem(item, title);
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
    return sources.reduce((previousPromise, source) => {
        return previousPromise.catch(_ => {
            return fetch(source, { cache: "no-store" }).then(res => {
                if (!res.ok) throw new Error("Fetch failed for " + source + " with HTTP " + res.status);
                return res.json();
            });
        });
    }, Promise.reject(new Error("Initial fetch failed")));
}

function normalizeCategoryReferencePath(pathValue) {
    if (typeof pathValue !== "string") return "";
    let trimmed = pathValue.trim().replace(/\\/g, "/");
    if (!trimmed) return "";
    if (trimmed.indexOf('.json') === -1) trimmed += '.json';
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

function fetchSectionData(itemsRef) {
    var ref = typeof itemsRef === "string" ? itemsRef.trim() : "";
    if (!ref) return Promise.resolve([]);

    var filename = ref.replace(/^\.?\/*/, "");
    if (filename.indexOf("data/") !== 0) {
        filename = "data/" + filename;
    }
    if (filename.indexOf(".json") === -1) {
        filename = filename + ".json";
    }

    var sources = ["/" + filename, "./" + filename];
    return fetchDataBySources(sources)
        .then(resolveCategoryReferences)
        .then(normalizeSectionCategories);
}

function fetchIndexConfig() {
    return fetchDataBySources(INDEX_DATA_SOURCES);
}

// --- unified favorites helpers (支持跨类型的统一收藏顺序与拖拽) ---
function addToUnifiedFavorites(url, mode) {
    removeFromUnifiedFavorites(url);
    state.unifiedFavorites.push({ mode: mode, url: url });
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

function moveUnifiedFavoriteToEnd(sourceUrl) {
    const srcIndex = state.unifiedFavorites.findIndex(function (e) {
        return e.url === sourceUrl;
    });

    if (srcIndex === -1 || srcIndex === state.unifiedFavorites.length - 1) return;

    const moved = state.unifiedFavorites.splice(srcIndex, 1)[0];
    state.unifiedFavorites.push(moved);
    renderFavorites();
}

function enableFavoriteDragGeneric(card, item) {
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


function getSectionId(prefix, sectionKey, categoryKey) {
    return prefix + "-" + sectionKey + "-" + categoryKey;
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

function toggleFavorite(item, mode) {
    if (isFavorited(item.url)) removeFromUnifiedFavorites(item.url);
    else addToUnifiedFavorites(item.url, mode);
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
            toggleFavorite(item, "logo");
            renderAll();
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

        toggleFavorite(groupItem, "no-logo");
        renderAll();
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
            const scrollContainer = refs.contentPane;
            var targetTop = target.offsetTop;
            var offset = 20;
            scrollContainer.scrollTo({ top: Math.max(0, targetTop - offset), behavior: "smooth" });
            setActiveCategory(sectionId);
            // on small screens, clicking a nav item should close the off-canvas menu
            try {
                if (window.innerWidth <= 900) {
                    const backdrop = document.querySelector('.sidebar-backdrop');
                    if (backdrop) backdrop.click();
                    else {
                        document.body.classList.remove('sidebar-open');
                        document.body.classList.remove('no-scroll');
                    }
                }
            } catch (e) {
                // ignore
            }
        }
    });

    listItem.appendChild(button);
    listElement.appendChild(listItem);
}

function renderFavoritesSidebar() {
    if (!refs.favoritesNavList) {
        return;
    }

    refs.favoritesNavList.innerHTML = "";
    // 合并为单一收藏入口
    createSidebarNavButton(refs.favoritesNavList, "收藏夹", FAVORITES_SECTION_ID);
}

function renderSectionsSidebar(sectionsForView) {
    if (!refs.dynamicNavContainer) return;

    refs.dynamicNavContainer.innerHTML = "";

    sectionsForView.forEach(function forEachSection(section, sIndex) {
        var block = document.createElement("div");
        block.className = "nav-block";

        var heading = document.createElement("h2");
        heading.textContent = section.title;
        block.appendChild(heading);

        var list = document.createElement("ul");
        section.categories.forEach(function forEachCategory(category, cIndex) {
            var categoryKey = category && category.key != null ? category.key : String(cIndex);
            var sectionId = getSectionId(SECTION_PREFIX, section.key, categoryKey);
            createSidebarNavButton(list, category.title, sectionId);
        });

        if (section.categories.length === 0) {
            var emptyItem = document.createElement("li");
            emptyItem.className = "nav-empty-item";
            emptyItem.textContent = "暂无内容";
            list.appendChild(emptyItem);
        }

        block.appendChild(list);
        refs.dynamicNavContainer.appendChild(block);
    });
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
            rootMargin: "-8px 0px -90% 0px",
            threshold: 0
        }
    );

    const sections = refs.contentPane.querySelectorAll(
        "#" + FAVORITES_SECTION_ID +
        ", .category-section[id], .group-category-section[id]"
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

function toggleCategoryFold(sectionKey, categoryKey) {
    var section = state.sections.find(function findSection(s) {
        return s.key === sectionKey;
    });

    if (!section) return;

    var category = section.categories.find(function findCategory(c) {
        return c.key === categoryKey;
    });

    if (!category) return;

    category.collapsed = !category.collapsed;
    renderAll();
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

function renderAll() {
    var sectionsForView = getFilteredSections();
    refs.categoriesContainer.innerHTML = "";
    renderSectionsSidebar(sectionsForView);

    if (sectionsForView.length === 0) {
        var noMatch = document.createElement("p");
        noMatch.className = "empty-state";
        noMatch.textContent = "未找到匹配内容。";
        refs.categoriesContainer.appendChild(noMatch);
        setupScrollSpy();
        return;
    }

    sectionsForView.forEach(function forEachSection(section, sIndex) {
        var sectionKey = section && section.key != null ? section.key : String(sIndex);
        var isLogoMode = section.logo === true;

        section.categories.forEach(function forEachCategory(category, cIndex) {
            var categoryKey = category && category.key != null ? category.key : String(cIndex);

            var sectionEl = document.createElement("section");
            sectionEl.className = isLogoMode ? "category-section" : "group-category-section";
            sectionEl.id = getSectionId(SECTION_PREFIX, sectionKey, categoryKey);

            var countText = category.items.length + " 个项目";
            var head = createCategorySectionHead(category, countText, function onToggle() {
                toggleCategoryFold(sectionKey, categoryKey);
            });

            sectionEl.appendChild(head);

            if (category.collapsed) {
                sectionEl.classList.add("is-collapsed");
                refs.categoriesContainer.appendChild(sectionEl);
                return;
            }

            var body = document.createElement("div");
            body.className = "section-body";

            if (category.items.length === 0) {
                var empty = document.createElement("p");
                empty.className = "empty-state";
                empty.textContent = "该分类暂时没有内容。";
                body.appendChild(empty);
            } else {
                var grid = document.createElement("div");
                grid.className = isLogoMode ? "card-grid" : "card-grid group-card-grid";

                category.items.forEach(function forEachItem(item) {
                    if (isLogoMode) {
                        grid.appendChild(createWebsiteCard(item, { showCategory: false }));
                    } else {
                        grid.appendChild(createGroupCard(item));
                    }
                });

                body.appendChild(grid);
            }

            sectionEl.appendChild(body);
            refs.categoriesContainer.appendChild(sectionEl);
        });
    });

    setupScrollSpy();
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
        const item = state.itemByName[entry.url];
        if (!item) return;

        var card;
        if (entry.mode === "logo") {
            card = createWebsiteCard(item);
        } else {
            card = createGroupCard(item);
        }
        refs.favoritesGrid.appendChild(card);
        enableFavoriteDragGeneric(card, item);
    });
}

function renderLoadingState() {
    refs.favoritesGrid.innerHTML = '<p class="loading-state">正在加载收藏夹...</p>';
    refs.categoriesContainer.innerHTML = '<p class="loading-state">正在加载数据...</p>';
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
    // 迁移旧数据：将 type 映射为 mode
    state.unifiedFavorites = state.unifiedFavorites.map(function migrate(entry) {
        if (entry.mode) return entry;
        var mode = "no-logo";
        if (entry.type === "website" || entry.type === "image" || entry.type === "article") {
            mode = "logo";
        }
        return { mode: mode, url: entry.url };
    });
    saveFavorites();
    renderFavoritesSidebar();

    fetchIndexConfig()
        .then(function onConfigLoaded(config) {
            if (!Array.isArray(config)) {
                throw new Error("index.json 格式无效，需要一个数组");
            }
            state.sectionConfigs = config;

            var loadTasks = config.map(function mapConfig(entry, index) {
                var sectionKey = String(index);
                return fetchSectionData(entry.items)
                    .then(categories => {
                        return {
                            title: entry.title,
                            logo: entry.logo === true,
                            key: sectionKey,
                            categories: categories
                        };
                    })
                    .catch(err => {
                        console.warn("加载分类数据失败:", entry.title, err);
                        return {
                            title: entry.title,
                            logo: entry.logo === true,
                            key: sectionKey,
                            categories: []
                        };
                    });
            });

            return Promise.all(loadTasks);
        })
        .then(function onAllLoaded(sections) {
            state.sections = sections;

            state.itemByName = {};
            sections.forEach(function forEachSection(section) {
                section.categories.forEach(function forEachCategory(category) {
                    category.items.forEach(function forEachItem(item) {
                        if (item.url) {
                            state.itemByName[item.url] = item;
                        }
                    });
                });
            });

            renderFavorites();
            renderAll();
        })
        .catch(function onInitError(err) {
            console.error("初始化失败:", err);
            renderErrorState(refs.categoriesContainer, "数据加载失败，请确保 data/index.json 及相关数据文件存在且格式正确。");
        });
}

function setupSearch() {
    if (!refs.searchInput) return;
    refs.searchInput.addEventListener("input", function onSearchInput(event) {
        state.searchQuery = event.target.value || "";
        renderAll();
    });
}

setupSearch();
setupFavoritesDropZone();
// mobile sidebar toggle: create backdrop and wire up toggle button for small screens
function setupMobileSidebarToggle() {
    const toggle = document.getElementById('mobileSidebarToggle');
    const sidebar = document.querySelector('.sidebar');
    // create backdrop if not present
    let backdrop = document.querySelector('.sidebar-backdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.className = 'sidebar-backdrop';
        document.body.appendChild(backdrop);
    }

    if (!toggle) return;

    // helper to lock/unlock scroll and touch gestures
    let preventTouchMove = null;

    function isMobileViewport() {
        return window.innerWidth <= 900;
    }

    function openSidebar() {
        document.body.classList.add('sidebar-open');
        lockScrollAndGestures();
    }

    function closeSidebar() {
        document.body.classList.remove('sidebar-open');
        unlockScrollAndGestures();
    }

    function lockScrollAndGestures() {
        document.body.classList.add('no-scroll');
        // Allow vertical scrolling inside sidebar, block background page touch scrolling.
        preventTouchMove = function (ev) {
            if (sidebar && sidebar.contains(ev.target)) {
                return;
            }
            ev.preventDefault();
        };
        document.addEventListener('touchmove', preventTouchMove, { passive: false });
    }

    function unlockScrollAndGestures() {
        document.body.classList.remove('no-scroll');
        if (preventTouchMove) {
            document.removeEventListener('touchmove', preventTouchMove, { passive: false });
            preventTouchMove = null;
        }
    }

    toggle.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        // only operate as off-canvas toggle on narrow screens
        if (!isMobileViewport()) return;

        const opened = document.body.classList.contains('sidebar-open');
        if (opened) closeSidebar();
        else openSidebar();
    });

    backdrop.addEventListener('click', function () {
        closeSidebar();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            closeSidebar();
        }
    });

    window.addEventListener('resize', function () {
        if (window.innerWidth > 900 && document.body.classList.contains('sidebar-open')) {
            closeSidebar();
        }
    });

    // Swipe gestures for mobile: right swipe from left edge opens; left swipe closes.
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTarget = null;

    document.addEventListener('touchstart', function (e) {
        if (!isMobileViewport() || !e.touches || !e.touches[0]) return;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTarget = e.target;
    }, { passive: true });

    document.addEventListener('touchend', function (e) {
        if (!isMobileViewport() || !e.changedTouches || !e.changedTouches[0]) return;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const dx = endX - touchStartX;
        const dy = endY - touchStartY;

        // Gesture should be mostly horizontal.
        if (Math.abs(dx) < 60 || Math.abs(dy) > 40) return;

        const opened = document.body.classList.contains('sidebar-open');
        const startInSidebar = Boolean(sidebar && touchStartTarget && sidebar.contains(touchStartTarget));
        const startInBackdrop = Boolean(backdrop && touchStartTarget && backdrop.contains(touchStartTarget));

        if (!opened && touchStartX <= 28 && dx > 0) {
            openSidebar();
            return;
        }

        if (opened && dx < 0 && (startInSidebar || startInBackdrop)) {
            closeSidebar();
        }
    }, { passive: true });
}

setupMobileSidebarToggle();
init();
