import { installToastBlockerHost } from './host.js';
import { scheduleFrontendReload } from './reload.js';

// 保留顶层自启动，让尚未实现 lifecycle hooks 的兼容宿主也能加载本扩展。
// 新版 SillyTavern / TauriTavern 会再次调用 activate；控制器本身是幂等的。
const controller = installToastBlockerHost();

export async function onActivate() {
  await controller.activate();
}

export async function onInstall() {
  await controller.install();
}

export async function onUpdate() {
  await controller.activate({ forceSave: true });
  scheduleFrontendReload();
}

export async function onEnable() {
  await controller.enableFromLifecycle();
}

export async function onDisable() {
  await controller.disableFromLifecycle();
}

export async function onClean() {
  await controller.clean();
}

export async function onDelete() {
  await controller.clean();
}
