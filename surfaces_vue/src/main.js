import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import './p1.css';
import './p2.css';
import './p3.css';
import './providers.css';
import './linear.css';
import { initPreferences } from './preferences';
initPreferences();
document.documentElement.dataset.style = 'linear';

createApp(App).mount("#app");
