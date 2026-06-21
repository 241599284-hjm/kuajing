"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlertTriangle, BarChart3, Bell, Boxes, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, FileClock, FileText, Globe2, LayoutDashboard, LayoutGrid, LogOut, Mail, Menu, Package, PackagePlus, PanelLeftClose, PanelLeftOpen, Search, Settings, ShieldCheck, ShoppingCart, Tags, Truck, UserRound, Users, WalletCards, Webhook, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useAdminSession } from "./admin-auth-gate.js";
import { DashboardPage, PaypalSettingsPage, RecordsPage, SiteSettingsPage } from "./admin-dashboard-pages.js";
import { AuditLogPanel } from "./audit-log-panel.js";
import { CategoryManagementPanel } from "./category-management-panel.js";
import { DeadLetterManagementPanel } from "./dead-letter-management-panel.js";
import { DiscountManagementPanel } from "./discount-management-panel.js";
import { EmailSettingsPanel } from "./email-settings-panel.js";
import { InventoryManagementPanel } from "./inventory-management-panel.js";
import { HomepageManagementPanel } from "./homepage-management-panel.js";
import { LogisticsManagementPanel } from "./logistics-management-panel.js";
import { MediaReconciliationManagementPanel } from "./media-reconciliation-management-panel.js";
import { OpsManagementPanel } from "./ops-management-panel.js";
import { OrderManagementPanel } from "./order-management-panel.js";
import { ProductImportManagementPanel } from "./product-import-management-panel.js";
import { ProductManagementPanel } from "./product-management-panel.js";
import { ProductListPanel } from "./product-list-panel.js";
import { ReviewManagementPanel } from "./review-management-panel.js";
import { TradeSettingsPanel } from "./trade-settings-panel.js";
import { Badge } from "./ui/badge.js";
import { Button } from "./ui/button.js";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.js";
import { Input } from "./ui/input.js";

type Section = "dashboard"|"orders"|"paypalOrder"|"refunds"|"webhooks"|"products"|"productEdit"|"categories"|"inventory"|"customers"|"paypalSandbox"|"paypalLive"|"paypalWebhook"|"logistics"|"site"|"homepage"|"productImport"|"discounts"|"reviews"|"trade"|"email"|"ops"|"dlq"|"media"|"audit";
type NavItem = { id: Section; label: string; icon: typeof BarChart3 };
const groups: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ id:"dashboard",label:"数据仪表盘",icon:BarChart3 }] },
  { label:"订单管理",items:[{id:"orders",label:"全部订单列表",icon:ShoppingCart},{id:"paypalOrder",label:"PayPal 订单详情",icon:WalletCards},{id:"refunds",label:"退款记录",icon:CircleDollarSign},{id:"webhooks",label:"Webhook 回调日志",icon:Webhook}] },
  { label:"商品管理",items:[{id:"products",label:"商品列表",icon:Package},{id:"productEdit",label:"新增 / 编辑商品",icon:PackagePlus},{id:"categories",label:"商品分类",icon:Tags},{id:"inventory",label:"库存预警",icon:AlertTriangle}] },
  { label:"客户管理",items:[{id:"customers",label:"买家列表",icon:Users}] },
  { label:"支付配置",items:[{id:"paypalSandbox",label:"PayPal 沙盒配置",icon:WalletCards},{id:"paypalLive",label:"PayPal 生产密钥",icon:ShieldCheck},{id:"paypalWebhook",label:"Webhook 订阅配置",icon:Webhook}] },
  { label:"内容与系统",items:[{id:"homepage",label:"首页可视化编辑",icon:LayoutDashboard},{id:"logistics",label:"物流模板设置",icon:Truck},{id:"site",label:"网站基础配置",icon:Settings}] },
  { label:"更多运营",items:[{id:"productImport",label:"商品导入",icon:PackagePlus},{id:"discounts",label:"折扣管理",icon:FileText},{id:"reviews",label:"评价管理",icon:ShieldCheck},{id:"trade",label:"跨境设置",icon:Globe2},{id:"email",label:"邮件设置",icon:Mail},{id:"dlq",label:"死信队列",icon:FileClock},{id:"media",label:"媒体对账",icon:Boxes},{id:"ops",label:"运维配置",icon:Settings},{id:"audit",label:"审计日志",icon:FileText}] }
];

function PageTitle({ title, description }: { title: string; description: string }) { return <div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-1 text-xs text-[var(--muted-foreground)]">{description}</p></div>; }
function ExistingPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) { return <div className="space-y-6"><PageTitle title={title} description={description}/>{children}</div>; }

function PayPalOrderPage({ onOrders }: { onOrders: () => void }) { return <div className="space-y-6"><div className="flex items-center justify-between"><PageTitle title="PayPal 订单详情" description="从全部订单进入后展示 Orders v2、本地订单、商品、金额、地址、物流和回调记录。"/><Button variant="outline" size="sm" onClick={onOrders}>选择订单</Button></div><Card><CardHeader><CardTitle>尚未选择订单</CardTitle><Badge tone="info">Orders v2</Badge></CardHeader><CardContent className="grid min-h-[360px] place-items-center text-center"><div><WalletCards className="mx-auto text-[var(--muted-foreground)]" size={28}/><p className="mt-4 text-sm font-medium">请从订单列表点击“查看详情”</p><p className="mt-1 text-xs text-[var(--muted-foreground)]">详情页不会用示例订单替代真实接口返回。</p></div></CardContent></Card></div>; }

export function AdminWorkspace() {
  const auth = useAdminSession();
  const [section,setSection]=useState<Section>("dashboard");
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [query,setQuery]=useState("");
  const flat = useMemo(()=>groups.flatMap((group)=>group.items),[]);
  const active=flat.find((item)=>item.id===section);
  function navigate(id:Section){setSection(id);setMobileOpen(false);}
  const content = (()=>{
    switch(section){
      case "dashboard": return <DashboardPage onOrders={()=>navigate("orders")}/>;
      case "orders": return <ExistingPage title="订单管理" description="管理 PayPal 支付订单、履约、退款和异常状态。"><OrderManagementPanel/></ExistingPage>;
      case "paypalOrder": return <PayPalOrderPage onOrders={()=>navigate("orders")}/>;
      case "refunds": return <RecordsPage kind="refunds"/>;
      case "webhooks": return <RecordsPage kind="webhooks"/>;
      case "products": return <ExistingPage title="商品列表" description="查看商品摘要与完整详情；编辑操作请进入新增 / 编辑商品。"><ProductListPanel/></ExistingPage>;
      case "productEdit": return <ExistingPage title="新增 / 编辑商品" description="商品保存、发布和删除均需要二次确认。"><ProductManagementPanel/></ExistingPage>;
      case "categories": return <ExistingPage title="商品分类" description="维护分类名称、排序和前台展示。"><CategoryManagementPanel/></ExistingPage>;
      case "inventory": return <ExistingPage title="库存预警" description="查看库存、安全库存、预留和手工调整记录。"><InventoryManagementPanel/></ExistingPage>;
      case "customers": return <RecordsPage kind="customers"/>;
      case "paypalSandbox": return <PaypalSettingsPage mode="sandbox"/>;
      case "paypalLive": return <PaypalSettingsPage mode="live"/>;
      case "paypalWebhook": return <PaypalSettingsPage mode="webhook"/>;
      case "logistics": return <ExistingPage title="物流模板设置" description="物流渠道、账号、轨迹和通知连通性。"><LogisticsManagementPanel/></ExistingPage>;
      case "site": return <SiteSettingsPage/>;
      case "homepage": return <HomepageManagementPanel/>;
      case "productImport": return <ExistingPage title="商品导入" description="链接导入、AI 草稿和发布前校验。"><ProductImportManagementPanel/></ExistingPage>;
      case "discounts": return <ExistingPage title="折扣管理" description="维护折扣规则、启停和有效期。"><DiscountManagementPanel/></ExistingPage>;
      case "reviews": return <ExistingPage title="评价管理" description="审核、回复和管理买家评价。"><ReviewManagementPanel/></ExistingPage>;
      case "trade": return <ExistingPage title="跨境设置" description="币种、税费、HS Code 与市场规则。"><TradeSettingsPanel/></ExistingPage>;
      case "email": return <ExistingPage title="邮件设置" description="邮件 Provider、模板、额度与发送日志。"><EmailSettingsPanel/></ExistingPage>;
      case "ops": return <ExistingPage title="运维配置" description="SSL、CDN、分析与站点诊断。"><OpsManagementPanel/></ExistingPage>;
      case "dlq": return <ExistingPage title="死信队列" description="处理失败异步任务并保留审计。"><DeadLetterManagementPanel/></ExistingPage>;
      case "media": return <ExistingPage title="媒体对账" description="处置媒体绑定不确定结果。"><MediaReconciliationManagementPanel/></ExistingPage>;
      case "audit": return <ExistingPage title="审计日志" description="查看敏感操作、配置变更和责任人。"><AuditLogPanel/></ExistingPage>;
    }
  })();
  const sidebar = <aside className={`fixed inset-y-12 left-0 z-40 flex flex-col border-r border-[var(--border)] bg-white transition-[width,transform] duration-200 ${collapsed?"w-16":"w-60"} ${mobileOpen?"translate-x-0":"-translate-x-full md:translate-x-0"}`}><nav className="flex-1 overflow-y-auto px-2 py-4">{groups.map((group,index)=><div className={index?"mt-4 border-t border-[var(--border)] pt-4":""} key={group.label??"main"}>{group.label&&!collapsed?<p className="px-3 pb-1.5 text-xs text-[var(--muted-foreground)]">{group.label}</p>:null}<div className="space-y-1">{group.items.map(({id,label,icon:Icon})=><button aria-current={section===id?"page":undefined} className={`flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors ${section===id?"bg-[#eef8f4] font-medium text-[#137858]":"text-[#536171] hover:bg-[var(--muted)]"}`} key={id} onClick={()=>navigate(id)} title={collapsed?label:undefined}><Icon className="shrink-0" size={18}/>{!collapsed?<span className="truncate">{label}</span>:null}</button>)}</div></div>)}</nav><button className="hidden h-12 items-center gap-3 border-t border-[var(--border)] px-4 text-sm text-[var(--muted-foreground)] md:flex" onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronRight size={17}/>:<ChevronLeft size={17}/>} {!collapsed?"收起菜单":null}</button></aside>;
  return <div className="min-h-screen bg-[var(--background)]"><header className="fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b border-[var(--border)] bg-white px-3"><Button className="md:hidden" variant="ghost" size="icon" onClick={()=>setMobileOpen(!mobileOpen)} aria-label="打开菜单">{mobileOpen?<X/>:<Menu/>}</Button><Button className="hidden md:inline-flex" variant="ghost" size="icon" onClick={()=>setCollapsed(!collapsed)} aria-label="收缩侧边栏">{collapsed?<PanelLeftOpen/>:<PanelLeftClose/>}</Button><div className="ml-1 flex min-w-0 items-center gap-2"><span className="grid size-7 place-items-center rounded-md border border-[#2b7d65] bg-[#edf8f4] text-[#176d54]"><LayoutGrid size={16}/></span><strong className="hidden truncate text-sm font-semibold sm:block">工艺品跨境管理后台</strong></div><div className="mx-auto hidden w-full max-w-xl px-6 lg:block"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--placeholder)]" size={16}/><Input className="pl-9" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="搜索订单号、PayPal 交易 ID、商品名称、买家邮箱"/>{query?<div className="absolute left-0 right-0 top-11 rounded-lg border border-[var(--border)] bg-white p-3 text-xs text-[var(--muted-foreground)] shadow-lg">全局搜索接口尚未返回匹配结果</div>:null}</div></div><div className="ml-auto flex items-center gap-1"><select className="hidden h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-sm sm:block" aria-label="币种"><option>USD ($)</option><option>EUR (€)</option><option>GBP (£)</option></select><Button variant="ghost" size="icon" aria-label="消息通知"><Bell size={18}/><span className="sr-only">消息通知</span></Button><DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" className="px-2"><span className="grid size-7 place-items-center rounded-full bg-[#e8f6f0] text-xs font-semibold text-[#157758]">管</span><span className="hidden max-w-24 truncate text-xs sm:block">{auth?.session.email??"管理员"}</span><ChevronDown size={14}/></Button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-[70] w-44 rounded-lg border border-[var(--border)] bg-white p-1 text-sm shadow-lg"><DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-[var(--muted)]"><UserRound size={15}/>账号设置</DropdownMenu.Item><DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-[var(--muted)]"><ShieldCheck size={15}/>修改密码</DropdownMenu.Item><DropdownMenu.Separator className="my-1 h-px bg-[var(--border)]"/><DropdownMenu.Item className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-[var(--danger)] outline-none hover:bg-[var(--danger-bg)]" onSelect={()=>void auth?.logout()}><LogOut size={15}/>退出登录</DropdownMenu.Item></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root></div></header>{mobileOpen?<button className="fixed inset-0 z-30 bg-black/25 md:hidden" onClick={()=>setMobileOpen(false)} aria-label="关闭菜单"/>:null}{sidebar}<main className={`min-h-screen pt-12 transition-[padding] duration-200 ${collapsed?"md:pl-16":"md:pl-60"}`}><div className="px-4 pb-12 pt-6 sm:px-6"><div className="mb-4 flex items-center gap-2 text-xs text-[var(--muted-foreground)]"><span>后台</span><ChevronRight size={12}/><span>{active?.label}</span></div>{content}</div></main></div>;
}
