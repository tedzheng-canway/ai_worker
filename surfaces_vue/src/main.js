import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";
import './p1.css';
import './p2.css';
import './p3.css';
import './providers.css';
import { initPreferences } from './preferences';
initPreferences();

createApp(App).mount("#app");
