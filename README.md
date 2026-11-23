# Elos

LemonAde 的智能俄罗斯方块网页版，移植自原版 EasyX V4.20。游戏保留原版的四套方块、棋盘尺寸、难度、边线样式、位图和 AI 落点策略。

## 操作

| 键位 | 功能 |
| --- | --- |
| Enter | 开始游戏 |
| ← / → | 左移 / 右移 |
| ↑ / ↓ | 旋转 / 下落一格 |
| P / Space | 暂停或继续 |
| C | 继续 |
| X | 让 AI 接管本局 |
| Q / Esc | 结束本局 |
| R | 回到开局设置 |

手机可以使用屏幕上的按键。每成功生成一个方块加 4 分，每消除一行加棋盘宽度的两倍。AI 沿着可达的移动路径寻找落点，偏好更深、外露边更少的位置。

## 本地运行

在项目根目录运行 `python3 -m http.server 8000`，打开 [localhost:8000](http://localhost:8000)。项目是原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。

GitHub Pages 从 `main` 分支根目录发布。自定义域名为 [tetris.qijiong.work](https://tetris.qijiong.work)。
