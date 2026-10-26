// 埋点字段和kotlin对齐
// https://iwiki.woa.com/p/4016234272#%E9%94%99%E8%AF%AF%E6%94%B6%E9%9B%86
/*
0 - 成功
1 - JS render失败（mermaid 语法错误）
3 - JS render执行超时
2 - JS截图失败（仅移动端）
4 - 移动端转 Bitmap/UIImage失败
5 - 内容不完整（用户手动取消生成，判断方式mark++的isComplete == false）
*/
const REPORT_ERROR_CODE_SUCCESS = 0
const REPORT_ERROR_CODE_JS_RENDER = 1
const REPORT_ERROR_CODE_RENDER_TIMEOUT = 3
const REPORT_ERROR_CODE_JS_CAPTURE = 2
const REPORT_ERROR_CODE_NATIVE_CAPTURE_TO_BITMAP = 4
const REPORT_ERROR_CODE_INCOMPLETE = 5

function getCanvasBackground(mode) {
    if (mode === 'dark') return '#212121';
    if (mode === 'default_white') return '#FFFFFF';
    return '#f8f8f8';
}

// 渲染控制对象
const Renderer = {
    timer: null,
    timeout: 2000,
    timeoutError: false,
    // mermaid是否经过二次修复
    isFixed: false,
    sequenceId: -1,

    init: function (mermaidCode, mode, end, sequenceId) {
        console.log('init mermaid, mode: ' + mode);
        this.clear();

        this.sequenceId = sequenceId;
        this.setupMermaid(mode);
        this.render(mermaidCode, end, sequenceId);
    },

    setupMermaid: function (mode) {
        // 初始化配置（禁用自动渲染）
        const initConfig = {
            securityLevel: 'strict',
            htmlLabels: false,      // 禁用HTML标签解析
            startOnLoad: false,
            theme: mode === 'dark' ? 'dark' : 'default',
            gantt: {
                useWidth: '1080' // 这个数值对应的是Android端的 H5 的 px，与 Android 端的 dp 差不多
            }
        };
        // 仅实验白底需要覆盖 mermaid 默认灰底；对照组/暗色保持现网 initialize，避免 themeVariables 改节点色
        if (mode === 'default_white') {
            initConfig.themeVariables = { background: '#FFFFFF' };
        }
        mermaid.initialize(initConfig);
        const canvasBg = getCanvasBackground(mode);
        const container = document.getElementById('container');
        if (container) {
            container.style.background = canvasBg;
        }
        const wrapper = document.getElementById('wrapper');
        if (wrapper) {
            wrapper.style.background = canvasBg;
        }
    },

    clear: function () {
        const container = document.getElementById('container');
        if (container) container.innerHTML = '';
        this.clearTimeout(this.timer);
        this.timeoutError = false;
        this.isFixed = false;
        this.sequenceId = -1;
    },

    _renderMermaid: async function (code, end, sequenceId) {
        // function sleep(ms) {
        //   return new Promise(resolve => setTimeout(resolve, ms));
        // }
        // test only
        // await sleep(2000)
        this.startTimer(end, sequenceId);
        try {
            const {svg} = await mermaid.render("chart", code);
            if (this.timeoutError || sequenceId !== this.sequenceId) throw new Error("Timeout");
            return svg;
        } catch (e) {
            if (this.timeoutError || sequenceId !== this.sequenceId) throw new Error("Timeout");

            // retry with sanitizer
            if (end && typeof MermaidSanitizer === 'object' && MermaidSanitizer.SanitizeMermaid) {
                code = MermaidSanitizer.SanitizeMermaid(code);
                this.isFixed = true;
                const {svg} = await mermaid.render("chart", code);
                if (this.timeoutError || sequenceId !== this.sequenceId) throw new Error("Timeout");
                return svg;
            } else {
                throw e;
            }
        }
    },

    render: async function (code, end, sequenceId) {
        try {
            const svg = await this._renderMermaid(code, end, sequenceId);
            if (this.timeoutError || sequenceId !== this.sequenceId) return;
            const container = document.getElementById("container");
            container.innerHTML = svg;
            // 通知渲染完成
            this.handleSuccess(sequenceId);
        } catch (error) {
            if (this.timeoutError || sequenceId !== this.sequenceId) return;
            const chart = document.getElementById('dchart');
            if (chart) {
                chart.style.display = 'none';
            }
            this.handleError(sequenceId, REPORT_ERROR_CODE_JS_RENDER, error.message || 'Render failed 语法错误')
        }
    },

    handleSuccess: function (sequenceId) {
        if (sequenceId !== this.sequenceId) {
            return;
        }
        this.clearTimeout()
        Android.onRenderComplete(sequenceId, this.isFixed)
    },

    handleError: function (sequenceId, errorCode, message) {
        if (sequenceId !== this.sequenceId) {
            return;
        }

        if (!this.timeoutError) {
            this.clearTimeout()
        } else {
            // 这里不能clearTimeout，否则正常逻辑执行完发现没超时会继续回调
        }
        Android.onError(sequenceId, this.isFixed, errorCode, message)
    },

    clearTimeout: function () {
        this.timeoutError = false
        if (this.timer) {
            clearTimeout(this.timer)
            this.timer = null
        }
    },

    startTimer: function (end, sequenceId) {
        const timeout = end ? 5000 : 500;
        this.timer = setTimeout(() => {
            this.timeoutError = true
            this.handleError(sequenceId, REPORT_ERROR_CODE_RENDER_TIMEOUT, 'Render timeout after ' + this.timeout + 'ms')
        }, timeout)
    },

    captureImage2: async function (mode, end, sequenceId) {
        if (sequenceId !== this.sequenceId) {
            Android.log(`captureImage2 invalid sequenceId ${sequenceId} != ${this.sequenceId}`);
            return;
        }
        const container = document.getElementById('container');
        if (!container) {
            this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Container not found');
            return;
        }

        try {
            const svgElement = container.querySelector('svg');
            if (!svgElement) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'SVG element not found');
                return;
            }

            // 获取图表尺寸
            const svgRect = svgElement.getBoundingClientRect();
            const width = svgRect.width;
            const height = svgRect.height;

            // 基本验证：确保SVG有合理的尺寸
            if (width <= 0 || height <= 0) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Invalid SVG dimensions');
                return;
            }

            // 克隆SVG元素，避免修改原始DOM
            const clonedSvg = svgElement.cloneNode(true);

            // 设置背景色和尺寸属性
            const backgroundColor = getCanvasBackground(mode);
            clonedSvg.setAttribute('width', width);
            clonedSvg.setAttribute('height', height);
            clonedSvg.style.backgroundColor = backgroundColor;

            // 直接使用outerHTML获取SVG字符串
            const svgString = clonedSvg.outerHTML;

            // 验证SVG字符串
            if (!svgString || svgString.length < 10 || !svgString.includes('<svg')) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Invalid SVG content');
                return;
            }

            // 创建Image和Canvas - 根据end参数调整画布大小和缩放
            const pixelRatio = window.devicePixelRatio || 1;
            // 如果end为true，使用更高的缩放因子来提高质量
            const qualityFactor = end ? 3 : 1;
            const finalScale = pixelRatio * qualityFactor;

            const canvas = document.createElement('canvas');
            canvas.width = width * finalScale;
            canvas.height = height * finalScale;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Failed to get canvas context');
                return;
            }

            // 根据缩放因子调整绘图上下文
            ctx.scale(finalScale, finalScale);
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, width, height);

            // 使用try-catch包装编码过程
            let svgUrl;
            try {
                const svgBase64 = btoa(unescape(encodeURIComponent(svgString)));
                svgUrl = "data:image/svg+xml;base64," + svgBase64;
            } catch (e) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'SVG encoding failed: ' + e.message);
                return;
            }

            // 使用Promise包装图片加载过程
            const pngDataUrl = await new Promise((resolve, reject) => {
                const img = new Image();

                // 添加事件处理器来检测加载错误
                img.addEventListener('error', function (event) {
                    console.log('Image loading error occurred');

                    // 尝试诊断具体原因
                    let errorReason = 'unknown';

                    // 检查SVG尺寸
                    if (svgString.length > 1024 * 1024) {
                        errorReason = 'svg_too_large';
                    }
                    // 检查是否包含可能导致问题的元素
                    else if (svgString.includes('foreignObject') ||
                        svgString.includes('xlink:href')) {
                        errorReason = 'unsupported_svg_elements';
                    }
                    // 检查是否有非ASCII字符
                    else if (/[^\x00-\x7F]/.test(svgString)) {
                        errorReason = 'non_ascii_characters';
                    }

                    console.log('Diagnosed error reason: ' + errorReason);
                    reject(new Error("retry capture android"));
                });

                // 添加加载中断处理
                img.addEventListener('abort', function () {
                    reject(new Error('Image loading aborted'));
                });

                // 成功处理
                img.onload = () => {
                    try {
                        //                         开启抗锯齿以获得更好的质量
                        ctx.imageSmoothingEnabled = true;
                        // 对于最终图像，使用更高的图像平滑质量
                        if (end) {
                            ctx.imageSmoothingQuality = 'high';
                        }

                        ctx.drawImage(img, 0, 0, width, height);

                        // 根据end参数调整PNG输出质量
                        const pngQuality = end ? 1.0 : 0.95;
                        const dataUrl = canvas.toDataURL('image/png', pngQuality);

                        if (!dataUrl || dataUrl.length < 100) {
                            reject(new Error('Generated PNG is invalid'));
                            return;
                        }
                        resolve(dataUrl);
                    } catch (e) {
                        reject(new Error('Canvas drawing failed: ' + e.message));
                    }
                };

                // 设置图像源
                img.src = svgUrl;

                // 检查图像是否已经有缓存
                if (img.complete) {
                    if (img.naturalWidth === 0) {
                        reject(new Error('Image loaded but has no dimensions'));
                    } else {
                        img.onload();
                    }
                }
            });

            // 验证生成的PNG数据
            if (!pngDataUrl || !pngDataUrl.startsWith('data:image/png')) {
                this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Generated PNG data is invalid');
                return;
            }

            Android.saveImage(sequenceId, pngDataUrl);
        } catch (error) {
            this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Capture failed: ' + (error.message || 'Unknown error'));
        }
    },

    captureImage3: async function (mode, end, sequenceId) {
        if (sequenceId !== this.sequenceId) {
            Android.log(`captureImage3 invalid sequenceId ${sequenceId} != ${this.sequenceId}`);
            return;
        }
        const container = document.getElementById('container')
        if (!container) {
            this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Container not found')
            return
        }
        html2canvas(container, {
            scale: 2,
            logging: false,
            useCORS: true
        }).then(canvas => {
            const base64Data = canvas.toDataURL('image/png');
            Android.saveImage(sequenceId, base64Data);
        }).catch(error => {
            this.handleError(sequenceId, REPORT_ERROR_CODE_JS_CAPTURE, 'Capture failed: ' + error.message)
        });
    },
}

window.Renderer = Renderer;
/* 加一点延时，否则首次可能出现渲染失败的情况 */
setTimeout(() => {
    Android.mermaidReady();
}, 20);