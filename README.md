# 轻盈日记

一个轻量但更像 App 的 PWA 减脂记录工具，可添加到 iPhone 或华为/鸿蒙手机桌面。

## 当前功能

- 记录：今日摄入、热量预算、还可吃多少、运动消耗和估算缺口。
- 拍照记一餐：可拍照或选相册；配置 AI 后可估算食物和 kcal，结果可修改。
- 手动记录：不配置 AI 时，也可以直接填写 kcal 保存。
- 今日运动：选择常见运动、分钟数和强度，估算消耗；也支持手动填 kcal。
- 轻断食：支持 14:10、16:8、18:6 和自定义进食窗口，记录开始/结束状态。
- 档案：体重、目标体重、BMI、身高、饮水量、热量预算和 7 天体重折线图。
- 同步：可选 Supabase，同一账号可在两台手机同步。

热量和运动消耗都是估算值，不是医学建议。身体不舒服时先调整节奏。

## 本地运行

本项目不需要安装依赖，也没有构建步骤。使用系统 Node 或 Codex 自带 Node 都可以。

```bash
node scripts/serve.mjs --host 0.0.0.0 --port 4174
```

打开终端输出里的地址：

- 电脑本机：`http://127.0.0.1:4174`
- 手机访问：使用脚本打印的 `http://局域网IP:4174`

手机和电脑需要在同一个 Wi-Fi。

## iPhone 添加到主屏幕

1. 用 Safari 打开部署后的 HTTPS 地址。
2. 点分享按钮。
3. 选择“添加到主屏幕”。
4. 名称保留“轻盈日记”即可。

## 华为/鸿蒙手机添加到桌面

1. 用系统浏览器打开部署后的 HTTPS 地址。
2. 打开浏览器菜单。
3. 选择“添加到桌面”或“添加到主屏幕”。

不同浏览器入口名字可能略有差异。

## AI 拍照分析配置

GitHub Pages 前端不能保存 OpenAI API key，所以 AI 分析通过 Supabase Edge Function 完成。

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
3. 部署函数：

```bash
supabase functions deploy analyze-food-photo
```

4. 设置 Supabase secrets：

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set OPENAI_VISION_MODEL=gpt-5.4-mini
```

5. 打开 App，点右上角“同步”，填入 Supabase URL 和 anon key。

只用 AI 分析时可以不登录；要跨设备同步时，再输入邮箱登录。

## 同步配置

同步是可选的。不配置时，记录会保存在当前手机浏览器本地。

需要同步时：

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
3. 在 Supabase Auth 里启用邮箱登录。
4. 打开 App，点右上角“同步”。
5. 填入 Supabase URL 和 anon key。
6. 输入邮箱，打开登录邮件链接。

同一账号在 iPhone 和鸿蒙登录后，可以同步记录。

## 开发验证

```bash
node --test
node --check src/main.js
node --check src/sync/syncService.js
node --check sw.js
```
