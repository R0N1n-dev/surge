import { createRouter, createWebHashHistory } from 'vue-router';

/**
 * Hash history, not HTML5 history.
 *
 * Capacitor serves the bundle from a custom scheme (`https://localhost/` on
 * Android). Deep paths work, but every cold deep-link (share intent, magnet
 * intent, widget tap) lands on `/` and the OS has no server to rewrite with —
 * hash routing makes any entry point a plain fragment that always resolves,
 * with zero native URL-mapping glue.
 */
const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/HomeView.vue'),
    meta: { nav: 'home', title: 'Surge' },
  },
  {
    path: '/downloads',
    name: 'downloads',
    component: () => import('@/views/DownloadsView.vue'),
    meta: { nav: 'downloads', title: 'Downloads' },
  },
  {
    path: '/add',
    name: 'add',
    component: () => import('@/views/AddView.vue'),
    meta: { title: 'New download', modal: true },
  },
  {
    path: '/media/:id?',
    name: 'media',
    component: () => import('@/views/MediaPickerView.vue'),
    meta: { title: 'Choose format', modal: true },
  },
  {
    path: '/torrent/:id?',
    name: 'torrent',
    component: () => import('@/views/TorrentView.vue'),
    meta: { title: 'Torrent', modal: true },
  },
  {
    path: '/detail/:id',
    name: 'detail',
    component: () => import('@/views/DetailView.vue'),
    meta: { title: 'Details', modal: true },
  },
  {
    path: '/browser',
    name: 'browser',
    component: () => import('@/views/BrowserView.vue'),
    meta: { nav: 'browser', title: 'Browser' },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/views/LibraryView.vue'),
    meta: { nav: 'library', title: 'Library' },
  },
  {
    path: '/queue',
    name: 'queue',
    component: () => import('@/views/QueueView.vue'),
    meta: { nav: 'queue', title: 'Queue & automation' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { nav: 'settings', title: 'Settings' },
  },
  {
    path: '/settings/themes',
    name: 'themes',
    component: () => import('@/views/ThemesView.vue'),
    meta: { title: 'Theme & colour' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});
