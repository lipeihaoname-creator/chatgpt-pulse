# 麻衣主题表情素材

本目录图片是内置 imagegen 根据用户提供的两张樱岛麻衣参考图生成的非官方同人表现。不是动画官方原图，也不表示获得原角色授权。项目代码许可不对原角色、原作或用户提供的参考图授予权利；这些角色素材与代码许可分开。自定义图片仅在用户设备上保存。

研究时搜索了正面、侧面、制服、微笑、思考及疑惑等形象。官方参考入口：
- https://ao-buta.com/tv/character/
- https://ao-buta.com/yumemiru/m_character/
- https://www.aniplex.co.jp/lineup/ao-buta-santa/news/detail/?id=70090

网页访问部分受站点限制；生成时实际输入仅为用户上传的两张 JPG，没有下载或嵌入第三方网站图片。

## 资源与状态

`open.png` 和 `blink.png` 均为透明 3×3 表情图集，按行排列：平静、专注、思考、说话、忙碌、等你、完成、疑惑、担心。闭眼图集仅用于短暂眨眼。前端以 CSS 定位切换图集，没有独立视频或额外运行服务。

推理→思考；输出→说话；工具→忙碌；需要回答或批准→等你；完成→微笑；无新信号→疑惑；读取异常→担心。表情不参与监测推断。动效为眨眼、轻微呼吸和可选工作星光/星环/柔光，支持关闭及系统减少动态效果。

## 生成方式与提示词

工具：内置 imagegen，参考图编辑/生成模式，transparent_background=true。原始图集保留在 Codex generated_images 中，应用使用本目录副本。2026-10-22。

第一步：

> Use case: stylized-concept, reference-guided character expression sprite atlas for a desktop performance monitor. Input image 1 and 2 are visual identity and anime style references for Mai Sakurajima (桜島麻衣); neither background is wanted. Create ONE square transparent PNG sprite atlas, exactly THREE EQUAL COLUMNS and THREE EQUAL ROWS, nine separate matching head-and-shoulder portraits. No visible grid, no captions, no letters, numbers, logos or watermark. Each portrait must stay wholly inside its equal square cell with a 10% transparent safety margin; all head centers, scale, shoulders and facing direction consistent. Keep the anime character recognizable: long dark charcoal slightly purple hair, violet eyes, signature double light silver hair clips on viewer's right plus the subtle pink bunny-shaped hair ornament, tan school blazer, white collar and red tie, fully clothed. Clean refined 2D anime cel shading, close to the uploaded references, normal anime proportions rather than chibi, no photorealism. Close crop optimized for 88px circular avatars. Character faces almost forward with a very slight turn, long hair framing face, identical camera and lighting. Exact expression layout, reading left to right: top row [calm neutral slight smile / alert focused attentive / thoughtful gaze slightly upward, gently pensive]; middle row [speaking friendly, small open mouth / concentrated determined busy, subtle brows / gently curious inviting the user's attention, slightly tilted brows]; bottom row [warm satisfied self-confident smile at task completion / mildly puzzled uncertain, not distressed / concerned but composed, monitoring unavailable]. Vary eyebrows, eyes and mouth clearly but preserve identity, alignment, hair and outfit across all nine cells. Keep eyes open except naturally smiling completion expression. Everything outside the portraits must be truly transparent, not a painted checkerboard. This is an expression atlas, not a collage with different crops. The entire square consists of exactly a 3 by 3 equal-cell grid.

第二步，以第一步输出为唯一参考：

> Edit this exact transparent 3x3 anime expression atlas to make a blink animation companion. Preserve the exact square canvas, 3 equal columns and 3 equal rows, every portrait's position, size, hairstyle, silhouette, outfit, mouth, eyebrows, expression and colors. Change ONLY the eyes: close both eyelids naturally in each portrait, with gentle fine curved anime eyelash lines. The smiling bottom-left portrait already has closed eyes and must remain identical. No movement of heads or hair or shoulder boundaries; these frames will alternate at identical coordinates so alignment is crucial. Keep true transparency. No grid, captions, letters, watermark or extra elements. All nine heads must remain fully in their existing equal cells. This is the same Mai Sakurajima character and existing expressions, only a closed eyelid moment, not new poses.

## 0.7.1 过渡帧

新增 `half.png`，用于睁眼→半闭眼→闭眼→半闭眼→睁眼的短暂眨眼。保留原始文件与透明度，仅复制到项目目录。表情间另有短暂淡化，不使用光流或对面部进行持续形变。

工具：内置 imagegen，precise-object-edit，输入为本目录的 open.png 和 blink.png，transparent_background=true。提示词：

> Use case: precise-object-edit. Create a SINGLE intermediate blink animation frame atlas between input image 1 (open eyes) and image 2 (closed eyes). Output the exact same transparent square canvas, exactly 3 equal columns and 3 equal rows. Preserve input 1 pixel alignment, all portrait positions, all head sizes, hair, shoulders, costumes, mouth expressions, colors, shadows, and silhouette. ONLY move the upper eyelids halfway down towards the closed eyelids in input 2: nine consistent Mai Sakurajima portraits with eyes half closed for a natural quick blink. Keep the bottom-left smiling portrait exactly identical, already closed eyes. Do not make anyone sleepy or change eyebrows or mouth. Keep partial violet irises visible under half lowered upper eyelids in the other eight cells. No head movement, no extra margin, no re-centering, no camera changes, no captions, no grid lines, no new objects. The atlas must align perfectly with input 1 for sequential animation. True transparent background, not a checkerboard. Final asset: one intermediate eyelid frame 3x3 sprite atlas, not a contact sheet of new poses.

## 0.15.0 空闲表情

新增 `emotions-v1.png`（1448×1086，透明 RGBA，4 列×3 行等大方格）。列为害羞、忍笑、鼓脸、困倦；行为睁眼、半闭眼、闭眼。不是对原有三张图集的覆盖。与原工作表情分开，优先保留自定义头像/状态图片；表情不参与监测判断。由内置 imagegen 基于现有 open.png 与用户本轮对应角色参考图制作，仅复制原始 PNG，未进行第三方视觉处理。完整提示词见根目录 CHARACTER_EMOTIONS.md。
