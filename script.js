document.addEventListener('DOMContentLoaded', () => {
    // --- グローバル変数 ---
    let allArticles = articlesData;
    let currentArticles = [];
    let selectedArticle = null;

    let tokenizer = null;
    let idfScores = {};
    const stopWords = new Set(['の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'もの', 'ため', 'れる', 'なり', 'など', 'つい', 'これ', 'それ', 'あれ', 'ない', 'ので', 'なる', 'という']);

    // カテゴリ定義 (データ例に合わせて修正)
    const subcategories = {
        "エンタメ": ["エンタメ総合", "音楽", "映画", "ゲーム", "アジア・韓流"],
        "ライフ": ["ライフ総合", "ヘルス", "環境", "文化・アート"],
        "地域": ["北海道・東北", "関東", "信越・北陸", "東海", "近畿", "中国", "四国", "九州・沖縄"],
        "スポーツ": ["スポーツ総合", "野球", "サッカー", "モータースポーツ", "競馬", "ゴルフ", "格闘技"],
        "国内": ["国内総合", "政治", "社会", "人"], // ★ 記事データに合わせて「国内総合」と「社会」を追加
        "国際": ["国際総合", "中国・台湾", "韓国・北朝鮮", "アジア・オセアニア", "北米", "中南米", "ヨーロッパ", "中東・アフリカ"],
        "経済": ["経済総合", "市況", "株式", "産業"],
        "IT": [],
        "科学": []
    };

    // --- DOM要素取得 ---
    const mainSliders = { topic: document.getElementById('topic-slider'), focus: document.getElementById('focus-slider'), style: document.getElementById('style-slider') };
    const sliderValues = { topic: document.getElementById('topic-value'), focus: document.getElementById('focus-value'), style: document.getElementById('style-value') };
    const articleContainer = document.getElementById('article-container');
    const articlePlaceholder = document.getElementById('article-placeholder');
    const articleContent = document.getElementById('article-content');
    const categoryTabs = document.querySelector('.category-tabs');
    const subcategoryContainer = document.getElementById('subcategory-tabs');
    const searchButton = document.getElementById('search-button');
    const searchKeywordInput = document.getElementById('search-keyword');
    const showMappingButton = document.getElementById('show-mapping-button');
    const showWordcloudButton = document.getElementById('show-wordcloud-button');
    const showAiSummaryButton = document.getElementById('show-ai-summary-button');
    const mappingModal = document.getElementById('mapping-modal');
    const wordcloudModal = document.getElementById('wordcloud-modal');
    const aiSummaryModal = document.getElementById('ai-summary-modal');
    const allModals = [mappingModal, wordcloudModal, aiSummaryModal];
    const aiSummarySliders = { topic: document.getElementById('ai-topic-slider'), focus: document.getElementById('ai-focus-slider'), style: document.getElementById('ai-style-slider') };
    const aiSliderValues = { topic: document.getElementById('ai-topic-value'), focus: document.getElementById('ai-focus-value'), style: document.getElementById('ai-style-value') };
    const aiSummaryOutput = document.getElementById('ai-summary-output');

    // --- 関数定義 ---
    function findClosestArticle() {
        const target = { topic: parseFloat(mainSliders.topic.value), focus: parseFloat(mainSliders.focus.value), style: parseFloat(mainSliders.style.value) };
        let bestMatch = null, minDistance = Infinity;
        if (currentArticles.length === 0) return null;
        currentArticles.forEach(article => {
            const dist = Math.sqrt(Math.pow(article.topic_score - target.topic, 2) + Math.pow(article.focus_score - target.focus, 2) + Math.pow(article.style_score - target.style, 2));
            if (dist < minDistance) { minDistance = dist; bestMatch = article; }
        });
        return bestMatch;
    }
    function displayArticle(article) {
        if (article) {
            selectedArticle = article;
            document.getElementById('article-title').textContent = article.title;
            document.getElementById('article-source').textContent = `出展: ${article.source}`;
            document.getElementById('article-published-at').textContent = `公開日時: ${article.published_at}`;
            document.getElementById('article-category').textContent = `カテゴリ: ${article.category}`;
            document.getElementById('article-body').textContent = article.body;
            document.getElementById('article-url').href = article.url;
            articlePlaceholder.classList.add('hidden');
            articleContent.classList.remove('hidden');
            showWordcloudButton.disabled = false;
            showAiSummaryButton.disabled = false;
        } else {
            articleContent.classList.add('hidden');
            articlePlaceholder.classList.remove('hidden');
            articlePlaceholder.querySelector('p').textContent = '条件に一致する記事がありません。';
            showWordcloudButton.disabled = true;
            showAiSummaryButton.disabled = true;
        }
    }
    
    // ★ 修正: updateArticleDisplay関数
    function updateArticleDisplay() {
        const activeCategoryButton = document.querySelector('.category-button.active');
        const activeCategory = activeCategoryButton ? activeCategoryButton.dataset.category : 'すべて'; // デフォルト値を設定
        
        const activeSubcategoryButton = document.querySelector('.subcategory-button.active');
        const activeSubcategory = activeSubcategoryButton ? activeSubcategoryButton.dataset.subcategory : null;
        
        const keyword = searchKeywordInput.value.toLowerCase().trim();
        let filtered = allArticles;

        if (activeCategory !== 'すべて') {
            filtered = allArticles.filter(article => {
                const parts = article.category.split('/');
                const articleMainCategory = parts[0];
                const articleSubCategory = parts[1] || (parts[0].endsWith('総合') ? parts[0] : null); // 「エンタメ総合」などの場合はそのままサブカテゴリとみなす
                
                // 大カテゴリでフィルタリング
                if (articleMainCategory !== activeCategory) {
                    return false;
                }

                // サブカテゴリが選択されている場合
                if (activeSubcategory) {
                    // もし記事のカテゴリが「大カテゴリ/小カテゴリ」形式なら小カテゴリ部分を比較
                    // そうでなく、「エンタメ総合」のように単一のカテゴリ名で、それが選択されたサブカテゴリ名と同じならOK
                    if (articleSubCategory) {
                        return articleSubCategory === activeSubcategory;
                    } else if (articleMainCategory === activeSubcategory) { // 「エンタメ総合」が選択されたサブカテゴリ名と一致する場合
                        return true;
                    }
                    return false; // サブカテゴリが選択されているが、記事に該当するサブカテゴリがない場合
                }
                
                // サブカテゴリが選択されていない場合（大カテゴリのみ選択）
                // 大カテゴリに属するすべての記事を含める
                return true;
            });
        }
        
        // キーワードフィルタリング
        if (keyword) {
            filtered = filtered.filter(a => a.title.toLowerCase().includes(keyword) || a.body.toLowerCase().includes(keyword));
        }
        currentArticles = filtered;
        const articleToDisplay = findClosestArticle();
        displayArticle(articleToDisplay);
    }

    // ★ 修正: updateSubcategoriesUI関数
    function updateSubcategoriesUI() {
        const categoryButton = document.querySelector('.category-button.active');
        const category = categoryButton ? categoryButton.dataset.category : null;

        subcategoryContainer.innerHTML = ''; // サブカテゴリボタンをクリア

        if (!category || category === 'すべて') {
            // 「すべて」が選択されている場合やカテゴリが選択されていない場合はサブカテゴリを表示しない
            return;
        }

        const subList = subcategories[category]; // 選択された大カテゴリのサブカテゴリリスト

        if (subList && subList.length > 0) {
            // その大カテゴリに属する記事が実際に持っているサブカテゴリのセット
            const actualSubcategoriesInArticles = new Set();
            allArticles.forEach(article => {
                const parts = article.category.split('/');
                const articleMainCategory = parts[0];
                const articleSubCategory = parts[1] || (parts[0].endsWith('総合') ? parts[0] : null);

                if (articleMainCategory === category && articleSubCategory) {
                    actualSubcategoriesInArticles.add(articleSubCategory);
                }
            });

            subList.forEach(sub => {
                const button = document.createElement('button');
                button.textContent = sub;
                button.className = 'subcategory-button';
                button.dataset.subcategory = sub;
                
                // サブカテゴリが実際に記事データに存在するかで disabled を判定
                // ただし、「〇〇総合」のようなものは、メインカテゴリと同じ扱いにしないとボタンがdisabledになる
                if (!actualSubcategoriesInArticles.has(sub) && !sub.endsWith('総合')) {
                    // 「〇〇総合」でないサブカテゴリが記事データに存在しない場合のみdisabled
                    button.disabled = true;
                }
                 // 「〇〇総合」ボタンは常に有効にするか、別途判定
                 // 例: その大カテゴリの記事が1つでもあれば有効にする
                if (sub.endsWith('総合')) {
                    const hasGeneralArticles = allArticles.some(a => a.category === sub);
                    if (!hasGeneralArticles) {
                        button.disabled = true; // 「国内総合」の記事がなければ無効化
                    }
                }


                subcategoryContainer.appendChild(button);
            });
            
            // 初回ロード時やカテゴリ切り替え時に、サブカテゴリの最初のボタンをアクティブにする
            // または、すでにアクティブなサブカテゴリがあればそれを保持
            const firstActiveSubButton = subcategoryContainer.querySelector('.subcategory-button:not(:disabled)');
            if (firstActiveSubButton) {
                firstActiveSubButton.classList.add('active');
            }
        }
    }


    // --- イベントリスナー設定 ---
    Object.values(mainSliders).forEach(slider => {
        slider.addEventListener('input', () => {
            // メインスライダーの値表示も小数点以下1桁に固定
            Object.keys(sliderValues).forEach(key => sliderValues[key].textContent = parseFloat(mainSliders[key].value).toFixed(1));
        });
        slider.addEventListener('change', updateArticleDisplay);
    });

    // ★ 修正: カテゴリタブのクリックイベントリスナー
    categoryTabs.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON') {
            const currentActiveCategoryButton = document.querySelector('.category-button.active');
            if (currentActiveCategoryButton) {
                currentActiveCategoryButton.classList.remove('active');
            }
            e.target.classList.add('active');
            
            // サブカテゴリボタンのアクティブ状態をリセット
            const currentActiveSubcategoryButton = subcategoryContainer.querySelector('.subcategory-button.active');
            if (currentActiveSubcategoryButton) {
                currentActiveSubcategoryButton.classList.remove('active');
            }

            updateSubcategoriesUI(); // サブカテゴリUIを更新
            updateArticleDisplay();   // 記事表示を更新
        }
    });

    // ★ 修正: サブカテゴリタブのクリックイベントリスナー
    subcategoryContainer.addEventListener('click', e => {
        if (e.target.tagName === 'BUTTON' && !e.target.disabled) {
            const currentActiveSubcategoryButton = subcategoryContainer.querySelector('.subcategory-button.active');
            if (currentActiveSubcategoryButton) {
                currentActiveSubcategoryButton.classList.remove('active');
            }
            e.target.classList.add('active');
            updateArticleDisplay(); // 記事表示を更新
        }
    });


    searchButton.addEventListener('click', updateArticleDisplay);
    searchKeywordInput.addEventListener('keyup', e => { if (e.key === 'Enter') updateArticleDisplay(); });

    showMappingButton.addEventListener('click', () => {
        const plotElement = document.getElementById('plot-container');
        const modalContent = plotElement.parentElement;
        // mapping-wrapperが既に存在しないことを確認してから作成
        let mappingWrapper = modalContent.querySelector('.mapping-wrapper');
        let modalArticleView = modalContent.querySelector('.modal-article-view');

        if (!mappingWrapper) {
            mappingWrapper = document.createElement('div');
            mappingWrapper.className = 'mapping-wrapper';
            mappingWrapper.style.display = 'flex';
            mappingWrapper.style.width = '100%';
            mappingWrapper.style.height = '100%';

            modalArticleView = document.createElement('div');
            modalArticleView.className = 'modal-article-view';
            plotElement.style.flex = '1 1 50%';
            modalArticleView.style.flex = '1 1 50%';
            modalArticleView.style.overflowY = 'auto';
            modalArticleView.style.padding = '0 20px';
            modalArticleView.style.boxSizing = 'border-box';
            modalArticleView.style.backgroundColor = '#fff';

            // plotElementをmodalContentから一時的に切り離し、wrapperに追加
            const originalPlotParent = plotElement.parentElement;
            mappingWrapper.appendChild(plotElement);
            mappingWrapper.appendChild(modalArticleView);
            modalContent.appendChild(mappingWrapper);

            // modal-article-viewの中身を初期化
            modalArticleView.innerHTML = `<div id="modal-article-content"><h2 id="modal-article-title" style="margin-top:20px;"></h2><p id="modal-article-source"></p><p id="modal-article-published-at"></p><p id="modal-article-category"></p><hr><div id="modal-article-body"></div><a id="modal-article-url" href="#" target="_blank">記事を読む</a></div><p id="modal-article-placeholder" style="margin-top:20px;">マップ上の点をクリックすると、ここに記事が表示されます。</p>`;
        }
        
        // 関数内関数をトップレベルに移動し、必要に応じて引数を渡す
        function displayArticleInModal(article) {
            if (article) {
                document.getElementById('modal-article-title').textContent = article.title;
                document.getElementById('modal-article-source').textContent = `出展: ${article.source}`;
                document.getElementById('modal-article-published-at').textContent = `公開日時: ${article.published_at}`;
                document.getElementById('modal-article-category').textContent = `カテゴリ: ${article.category}`;
                document.getElementById('modal-article-body').textContent = article.body;
                document.getElementById('modal-article-url').href = article.url;
                document.getElementById('modal-article-content').style.display = 'block';
                document.getElementById('modal-article-placeholder').style.display = 'none';
            }
        }
        
        document.getElementById('modal-article-content').style.display = 'none';
        document.getElementById('modal-article-placeholder').style.display = 'block';

        if (currentArticles.length > 0) {
            const trace = { x: currentArticles.map(a => a.topic_score), y: currentArticles.map(a => a.focus_score), z: currentArticles.map(a => a.style_score), mode: 'markers', type: 'scatter3d', text: currentArticles.map(a => a.title), marker: { size: 5, color: currentArticles.map(a => a.topic_score), colorscale: 'Viridis', opacity: 0.8, colorbar: { title: 'Topic' } } };
            const layout = { title: { text: `記事マッピング (${currentArticles.length}件)`, font: { size: 14 } }, scene: { xaxis: { title: 'Topic' }, yaxis: { title: 'Focus' }, zaxis: { title: 'Style' } }, margin: { l: 0, r: 0, b: 0, t: 40 } };
            Plotly.newPlot(plotElement, [trace], layout);
            plotElement.on('plotly_click', data => { if (data.points.length > 0) { const pointIndex = data.points[0].pointNumber; const clickedArticle = currentArticles[pointIndex]; if (clickedArticle) { displayArticleInModal(clickedArticle); } } });
        } else { plotElement.innerHTML = '<p>表示できる記事がありません。</p>'; }
        mappingModal.style.display = 'block';
    });


    showWordcloudButton.addEventListener('click', () => {
        if (!selectedArticle || !tokenizer) {
            alert("単語データが準備できていません。少々お待ちください。");
            return;
        }

        const tokens = tokenizer.tokenize(selectedArticle.body);
        const termFreq = {};
        let totalTermsInDoc = 0;

        tokens.forEach(token => {
            if (token.pos === '名詞' || token.pos === '動詞' || token.pos === '形容詞') {
                const word = token.basic_form;
                if (word.length > 1 && !stopWords.has(word) && isNaN(word)) {
                    termFreq[word] = (termFreq[word] || 0) + 1;
                    totalTermsInDoc++;
                }
            }
        });

        if (totalTermsInDoc === 0) {
            alert("ワードクラウドに表示できる有効な単語が見つかりませんでした。");
            return;
        }

        const tfidfList = [];
        for (const word in termFreq) {
            const tf = termFreq[word] / totalTermsInDoc;
            // IDFスコアの存在を確認し、デフォルト値（0または非常に小さい値）を設定
            const idf = idfScores[word] !== undefined ? idfScores[word] : 0;
            const tfidf = tf * idf;
            if (tfidf > 0) {
                // tfidf値を適度なスケールに調整 (例: 10000倍)
                tfidfList.push([word, tfidf * 10000]);
            }
        }

        tfidfList.sort((a, b) => b[1] - a[1]);
        const topWords = tfidfList.slice(0, 100);

        if (topWords.length === 0) {
            alert("ワードクラウドに表示できる有効な単語が見つかりませんでした。");
            return;
        }

        const wordcloudContainer = document.getElementById('wordcloud-container');

        let wordcloudCanvas = document.getElementById('wordcloud-canvas');
        if (!wordcloudCanvas) {
            wordcloudCanvas = document.createElement('canvas');
            wordcloudCanvas.id = 'wordcloud-canvas';
            wordcloudContainer.appendChild(wordcloudCanvas);
        }

        // Canvasのサイズを固定値に設定する
        wordcloudCanvas.width = 500;
        wordcloudCanvas.height = 500;

        // ワードクラウドを描画
        WordCloud(wordcloudCanvas, {
            list: topWords,
            // weightFactorは単語のサイズに影響します。調整が必要な場合もあります。
            shrinkToFit: true,
            clearCanvas: true,
            minRotation: 0,
            maxRotation: 0,
        });

        // モーダルを表示
        wordcloudModal.style.display = 'block';
    });

    // AI要約ボタンのイベントリスナーを正しい位置に配置
    showAiSummaryButton.addEventListener('click', () => {
        if (!selectedArticle) {
            alert("記事が選択されていません。記事を選択してから再度お試しください。");
            return;
        }
        // メインのスライダー値をAI要約スライダーにコピー
        Object.keys(aiSummarySliders).forEach(key => {
            aiSummarySliders[key].value = mainSliders[key].value;
            // AI要約スライダーの値表示も小数点以下1桁に固定
            aiSliderValues[key].textContent = parseFloat(mainSliders[key].value).toFixed(1);
        });
        // AI要約を更新
        updateAiSummary();
        // モーダルを表示
        aiSummaryModal.style.display = 'block';
    });

    function updateAiSummary() {
        if (!selectedArticle) return;
        const target = {
            topic: parseFloat(aiSummarySliders.topic.value),
            focus: parseFloat(aiSummarySliders.focus.value),
            style: parseFloat(aiSummarySliders.style.value)
        };
        let closestKey = '', minDistance = Infinity;
        for (const key in selectedArticle.summaries) {
            const [topic, focus, style] = key.split(',').map(Number);
            const dist = Math.sqrt(Math.pow(topic - target.topic, 2) + Math.pow(focus - target.focus, 2) + Math.pow(style - target.style, 2));
            if (dist < minDistance) { minDistance = dist; closestKey = key; }
        }
        aiSummaryOutput.textContent = selectedArticle.summaries[closestKey] || '要約が見つかりません。';
    }

    Object.values(aiSummarySliders).forEach(slider => {
        slider.addEventListener('input', (e) => {
            const key = e.target.id.split('-')[1];
            // AI要約スライダーの値表示を小数点以下1桁に固定
            aiSliderValues[key].textContent = parseFloat(e.target.value).toFixed(1);
            updateAiSummary();
        });
    });

    function cleanupMappingModal() {
        const modalContent = mappingModal.querySelector('.modal-content');
        const wrapper = modalContent.querySelector('.mapping-wrapper');
        const plotElement = document.getElementById('plot-container');
        if (wrapper) {
            modalContent.appendChild(plotElement);
            plotElement.style.flex = '';
            wrapper.remove();
        }
    }
    allModals.forEach(modal => {
        const closeButton = modal.querySelector('.close-button');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                modal.style.display = 'none';
                if (modal.id === 'mapping-modal') { cleanupMappingModal(); }
            });
        }
    });
    window.addEventListener('click', e => {
        if (allModals.includes(e.target)) {
            e.target.style.display = 'none';
            if (e.target.id === 'mapping-modal') { cleanupMappingModal(); }
        }
    });

    async function initializeApp() {
        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'loading-overlay';
        loadingOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(255,255,255,0.9);z-index:9999;display:flex;align-items:center;justify-content:center;';
        loadingOverlay.innerHTML = '<p style="font-size:1.2em;"><strong>単語データを準備中です...</strong> (初回は時間がかかることがあります)</p>';
        document.body.appendChild(loadingOverlay);

        try {
            tokenizer = await new Promise((resolve, reject) => {
                kuromoji.builder({ dicPath: 'dict/' }).build((err, tokenizerInstance) => {
                    if (err) return reject(err);
                    console.log("Tokenizer initialized."); // 成功ログ
                    resolve(tokenizerInstance);
                });
            });

            const totalDocs = allArticles.length;
            const docFreq = {};

            for (const article of allArticles) {
                if (!article.body) continue;
                const tokens = tokenizer.tokenize(article.body);
                const wordsInDoc = new Set();
                tokens.forEach(token => {
                    if (token.pos === '名詞' || token.pos === '動詞' || token.pos === '形容詞') {
                        const word = token.basic_form;
                        if (word.length > 1 && !stopWords.has(word) && isNaN(word)) {
                            wordsInDoc.add(word);
                        }
                    }
                });
                wordsInDoc.forEach(word => {
                    docFreq[word] = (docFreq[word] || 0) + 1;
                });
            }

            for (const word in docFreq) {
                idfScores[word] = Math.log(totalDocs / docFreq[word]);
            }
            console.log("IDF scores calculated."); // 成功ログ

            // アプリケーション初期化時にUIを更新
            updateSubcategoriesUI();
            updateArticleDisplay();

        } catch (err) {
            console.error("アプリの初期化に失敗しました:", err);
            loadingOverlay.innerHTML = `<p style="color:red;"><strong>エラー:</strong> 単語データの準備に失敗しました。<br>HTMLファイルと同じ場所に<strong>dictフォルダ</strong>が正しく設置されているか確認してください。</p>`;
        } finally {
            if (document.body.contains(loadingOverlay)) {
                setTimeout(() => document.body.removeChild(loadingOverlay), 500); // 少し待ってから消す
            }
        }
    }

    initializeApp();
});