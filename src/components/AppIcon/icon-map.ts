/**
 * 图标映射表
 *
 * 约束与设计理由：
 *  1. **具名导入**：只引入实际用到的图标，配合 lucide-vue-next 的
 *     `sideEffects: false`，未被使用的图标会被构建工具摇掉；
 *  2. **禁止动态拼接模块路径**：后端菜单返回的图标只能是这里登记的**键名**，
 *     不能形如 `import('lucide-vue-next/' + name)`，否则等于开放任意模块加载；
 *  3. **默认图标兜底**：后端配错图标名时不至于渲染出空白；
 *  4. **类型约束**：AppIconName 由映射表自动推导，新增图标无需手写联合类型。
 */

import type { Component } from 'vue'
import {
  ChevronDown,
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  Filter,
  Globe,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MapPin,
  Moon,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-vue-next'

/** 受约束的图标映射表 */
export const iconMap = {
  ChevronDown,
  CircleAlert,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  Filter,
  Globe,
  MapPin,
  Home,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PanelLeft,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} as const satisfies Record<string, Component>

/** 可用图标名称（由映射表推导，保持单一数据源） */
export type AppIconName = keyof typeof iconMap

/** 兜底图标（导出给 AppIcon 用于开发期提示） */
export const FallbackIcon: Component = FileSearch

/** 判断名称是否已在映射表中登记 */
export function isValidIconName(name: string): name is AppIconName {
  return Object.prototype.hasOwnProperty.call(iconMap, name)
}

/**
 * 安全解析图标：未登记的名称一律回退到兜底图标。
 */
export function resolveIcon(name: string | undefined): Component {
  if (!name) {
    return FallbackIcon
  }
  if (!isValidIconName(name)) {
    return FallbackIcon
  }
  return iconMap[name]
}

/** 已登记的图标名称列表，便于调试 */
export function listIconNames(): AppIconName[] {
  return Object.keys(iconMap) as AppIconName[]
}
