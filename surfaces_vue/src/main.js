import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import './conversation-workspace.css';
import './integrations-workflows.css';
import './settings-setup.css';
import './providers.css';
import './models.css';
import './macos-vibrancy.css';
import { initPreferences } from './preferences';
initPreferences();
document.documentElement.dataset.style = 'macos-vibrancy';

createApp(App).mount("#app");
