# Blockchain Breathing

Expérience d'art génératif, évolutive et cyclique, dont la forme est dictée en temps réel par l'activité de la blockchain Ethereum.

- **Le slot (12 s)** : chaque bloc validé ajoute un trait à la toile.
- **L'epoch (32 slots ≈ 6 min 24 s)** : une œuvre complète, puis la toile se réinitialise.
- **Le prix de l'ETH** pilote la palette et l'orientation.
- **Le nombre de transactions** pilote l'agitation visuelle.

100 % statique, zéro dépendance, zéro clé API. Hébergé sur GitHub Pages.

## Structure

```
index.html       → l'expérience contemplative (canvas plein écran)
gallery.html     → galerie des epochs passées (rejouées localement)
assets/core.js   → moteur de génération déterministe (partagé)
assets/app.js    → le canvas temps réel
assets/gallery.js→ la galerie
assets/style.css → styles
```

## Comment ça marche

1. Toutes les ~5 s, le site interroge un RPC Ethereum public (sans clé) pour le dernier bloc : timestamp + nombre de transactions.
2. Le prix de l'ETH vient de CoinGecko (gratuit, CORS ouvert).
3. À chaque nouveau bloc, une forme générative est dessinée : le prix choisit la palette, le nombre de transactions choisit la complexité et l'agitation (segments, respiration, torsion, ondes, dérive, champs de bruit). Au-delà de ~100 tx, des particules explosent.
4. À la fin de l'epoch, la toile est figée quelques secondes, puis sauvegardée en localStorage (données brutes des 32 slots) et la suivante commence.
5. La galerie rejoue les toiles à partir de ces données : l'art étant déterministe, le résultat est identique.

## Crédits

Le concept général (des formes génératives qui évoluent au fil des itérations) est inspiré d'[UJI](https://github.com/doersino/uji) par [doersino](https://noahdoersing.com/) (Noah Doersing). Le moteur de ce projet est une implémentation originale : formes (cercle, étoile, spirale, lemniscate, polygone) et déformations (respiration, torsion, ondes, fusion, dérive, champs de bruit) propres au projet.

## Déploiement

Pousser sur `main` → le workflow `.github/workflows/pages.yml` déploie automatiquement sur GitHub Pages.
