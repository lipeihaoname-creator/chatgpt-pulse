document.documentElement.classList.toggle('overlay-root',new URLSearchParams(location.search).has('overlay'));
import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
mount(App, { target: document.getElementById('app') });

import './appearance.css';
