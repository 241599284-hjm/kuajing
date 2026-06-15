# Premium Minimal Visual System

本文件是前台商城、后台管理、后续主题系统的统一视觉与交互规范。任何页面改造、新增模块、后台表单、弹窗、空状态、错误状态，都必须先对齐本文件。

具体页面模板见 `docs/module-visual-templates.md`。新增模块必须先选择模板，再写页面。

## 适用范围

- `apps/storefront`
- `apps/admin`
- 后续主题配置后台
- OpenDesign 参考转译后的主题 tokens
- 可复制交付给客户后的默认主题

## 当前状态

- 前台主要页面已经统一到 `premium-minimal`：白底、细线、Serif 大标题、黑色主按钮、真实产品摄影、统一 Header。
- 后台已有中文管理壳、左侧菜单、统一基础色值，但表单、卡片、按钮仍有较多页面内 Tailwind class 重复。
- 后台公共 UI primitives 已开始落地：`apps/admin/app/components/admin-ui.tsx`。
- 商品、商品分类、地域分类、折扣管理、邮箱设置、外贸设置已迁入公共 `AdminPanel`、`AdminListCard`、`AdminField`、`AdminPrimaryButton`、`AdminSecondaryButton`、`AdminToggleButton`、`AdminCheckbox`、`AdminHelpText`。
- `AdminTextarea`、`AdminFileInput` 已补充，用于商品详情图文和图片选择入口。
- `docs/module-visual-templates.md` 已补充“模块到模板映射表”，后续 `catalog`、`media`、`inventory`、`order`、`payment`、`logistics`、`aftersales`、`promotion`、`risk`、`finance`、`tax`、`fx`、`notification`、`content`、`search`、`theme`、`reporting` 模块都必须先按矩阵选模板。
- 后续开发必须先补公共组件/公共 class，再改业务页。禁止新增页面各写一套局部视觉。
- 品牌元素库已开始落地：`HLArtisanLogo`、`HLArtisanSeal`、`HLArtisanDivider` 统一承载 H & L ARTISAN 矢量 Logo、北京印章、品牌分隔线和等待动效。

## 基础风格

- 背景：白色或接近白色，不使用大面积彩色渐变、装饰球、复杂纹理。
- 分隔：细线边框，颜色使用 `var(--line)`。
- 主色：黑色主按钮与文字，少量蓝色只用于后台运营强调或链接状态。
- 装饰：少即是多，优先使用产品照片、留白、排版层级，不用无意义图形装饰。
- 卡片：只用于商品、表单分组、重复列表、弹窗、工具面板，不把整页 section 做成大卡套小卡。
- 圆角：普通卡片不超过 8px；主按钮可用胶囊圆角；工具型输入框使用 6px 左右。

## 字体

- 标题：Serif，使用 `.premium-display`，例如 `Georgia, "Times New Roman", serif`。
- 正文：系统无衬线字体。
- 字距：`letter-spacing: 0` 为默认。仅小型 eyebrow/标签允许轻微 uppercase tracking。
- 页面级大标题只用于首页、分类页、地域页、商品详情、购物车、结账、账户页。
- 卡片、表单、侧栏内标题必须使用较小字号，不能滥用 hero 级字体。

## 颜色 Tokens

前台默认：

- `--bg: #fbfaf7`
- `--surface: #f3f0ea`
- `--surface-strong: #e9e4da`
- `--ink: #111111`
- `--ink-soft: #68645d`
- `--accent: #111111`
- `--line: #e1ded6`

后台默认：

- `--bg: #f7f7f4`
- `--surface: #ffffff`
- `--ink: #111111`
- `--ink-soft: #5f5f5b`
- `--accent: #0864e6`
- `--line: #e0ded8`

规则：

- 新颜色必须先加入 tokens 或主题配置，不允许页面内随手写独立颜色。
- 前台 buyer-facing 页面以黑白灰为主，避免一页一个配色。
- 错误状态使用统一红色语义，不在不同页面自造错误颜色。

## 公共组件优先级

新增或改造页面时，按这个顺序执行：

1. 更新或新增公共布局组件。
2. 更新或新增公共按钮、输入框、卡片、状态提示、弹窗组件。
3. 从 `docs/module-visual-templates.md` 的“模块到模板映射表”选择前台、后台、状态/异常模板。
4. 业务页面只组合公共组件和少量布局 class。
5. 截图验收手机、平板、桌面。

禁止：

- 为单个页面新增一套视觉规则。
- 在业务页面写大量一次性 class 代替公共组件。
- 使用行内样式控制常规视觉；媒体宽高、性能型 `content-visibility` 等例外必须有明确原因。
- 新页面重搭结构导致 Header、间距、按钮、卡片和现有页面不一致。

## 前台公共规则

- Header：使用 `PremiumStorefrontHeader`，所有前台页面共用。
- 品牌元素：Logo、印章、品牌分隔线、等待动效必须使用 `apps/storefront/app/components/hl-artisan-logo.tsx`，不得在页面里复制 SVG、使用截图或另画一版。
- 容器：使用 `.premium-container`。
- 页面外壳：使用 `.premium-shell`。
- 主按钮：使用 `.premium-btn`。
- 次按钮：使用 `.premium-btn-outline`。
- 焦点态：交互元素必须具备 `.premium-focus` 或等价可见 focus。
- 商品图：必须 `max-width: 100%`，使用固定 aspect ratio，避免布局跳动。
- 商品详情媒体：详情图 lazy load，视频 `preload="metadata"`，不得一次性加载所有大图或视频。

## 后台公共规则

- 后台默认中文。
- 后台是运营工具，不做营销落地页风格，不用大 hero。
- 左侧菜单、顶部操作区、表单分组、列表项、状态提示必须统一。
- 表单输入高度优先 44px 或以上。
- 结构化字段优先用下拉、多选、开关、排序输入、上传控件。
- 商品、分类、地域、折扣、邮箱、外贸设置等页面不得各自定义不同按钮和输入样式。
- 后续后台页面优先复用：`AdminPanel`、`AdminField`、`AdminTextInput`、`AdminSelect`、`AdminPrimaryButton`、`AdminInlineStatus`、`AdminListCard`、`AdminCheckbox`、`AdminHelpText`。

## 双语与格式化

- 买家侧文案必须中英文双语。
- 语言切换使用全局状态，刷新和跳转后保持。
- 语言请求头使用 `accept-language` 透传到网关和服务。
- 金额格式化使用整数最小货币单位，不在页面临时拼字符串。
- 时间存储使用 UTC，展示时按店铺/用户时区格式化。
- 空数据、加载中、失败、商品下架、404 必须有统一视觉和双语文案。

## 交互规则

- 主按钮 hover：轻微降低亮度或透明度，不做大幅动画。
- 加载状态：按钮禁用，显示明确 loading 或状态文案。
- 错误提示：靠近操作区域，颜色统一，文字具体说明失败原因。
- 弹窗：居中或移动端底部/全屏抽屉，不能遮挡关键按钮后无关闭入口。
- 移动端抽屉：左上角菜单打开，全屏遮罩，侧栏宽度不造成横向溢出。
- 触控目标：移动端主要可点击区域不小于 44px。

## 响应式规则

- 断点至少覆盖：390px 手机、768px 平板、1440px 桌面。
- 移动端竖屏优先，文本不得互相覆盖或挤出容器。
- iPad 不能简单套手机布局，要允许两列或更宽的表单布局。
- 图片、表格、表单在小屏必须可读，不产生横向滚动。
- 每次页面视觉调整必须跑 Playwright 响应式截图或对应 e2e。

## 验收标准

页面通过视觉验收必须同时满足：

- Header、按钮、卡片、输入框、弹窗、状态提示与已有页面一致。
- 前台页面使用 `premium-minimal` 风格，不出现突兀颜色或营销式大装饰。
- 后台页面保持运营工具风格，信息密度合适。
- 手机、平板、桌面无横向溢出。
- 买家侧页面中英文都可读。
- 图片不变形，详情媒体不阻塞滑动。
- 加载、空数据、失败、下架、404 状态不白屏。

## 后续执行

下一步视觉工程不是继续堆页面，而是：

1. 继续给 storefront/admin 增加视觉回归截图清单。
2. 补充 `AdminErrorMessage`、`AdminModal`、`AdminPagination`、`AdminTableOrCards` 等后续列表/详情页 primitives。
3. 将主题 tokens 接入后台可配置项。
