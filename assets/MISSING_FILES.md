# 缺失资源文件清单

以下是 `js/config.js` 和 `index.html` 中引用但尚未找到的资源文件。
请将它们放入对应的 assets/ 子目录中：

## 必须补充（功能依赖）

| 文件名 | 目标路径 | 说明 |
|--------|---------|------|
| `logo.png` | `assets/icons/logo.png` | 网站 favicon / 标题图标 |
| `cat.ico` | `assets/icons/cat.ico` | 自定义鼠标光标（128×128 像素） |
| `ai-avatar.png` | `assets/images/ai-avatar.png` | AI 头像（AI 对话界面中显示） |
| `bgm2.mp3` | `assets/audio/bgm2.mp3` | 第二首背景音乐 |
| `bgm3.mp3` | `assets/audio/bgm3.mp3` | 第三首背景音乐 |

## 幻灯片背景图（已有 22 岁图片，其他年龄段请补充）

| 文件名 | 目标路径 | 说明 |
|--------|---------|------|
| `19-1.webp` | `assets/images/19-1.webp` | 19岁相册背景图 |
| `20-1.webp` | `assets/images/20-1.webp` | 20岁相册背景图 |
| `20-2.webp` | `assets/images/20-2.webp` | 20岁相册背景图 |
| `21-1.webp` | `assets/images/21-1.webp` | 21岁相册背景图 |
| `21-2.webp` | `assets/images/21-2.webp` | 21岁相册背景图 |
| `21-3.webp` | `assets/images/21-3.webp` | 21岁相册背景图 |
| `21-4.webp` | `assets/images/21-4.webp` | 21岁相册背景图 |

## 配置说明

补充完文件后，文件引用路径已在新项目的以下位置配置好：

- `index.html` 中的 `href="assets/icons/logo.png?v=2"` 和 `src="assets/images/..."`
- `js/config.js` 中的 `playlist` 数组（bgm2.mp3 / bgm3.mp3）
- `js/config.js` 中的 `albums2` 对象（19/20/21/22岁 webp 图片路径）

**注意**：音乐文件 `bgm.mp3` 已从 `pictures/` 目录复制到 `assets/audio/`，
`bgm2.mp3` 和 `bgm3.mp3` 需要手动补充到同一目录。
