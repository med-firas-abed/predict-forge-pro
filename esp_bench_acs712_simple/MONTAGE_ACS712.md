# Montage ACS712 + MPU6050 + ESP32

## 1. Cote ESP32 / capteurs

- `ESP32 3V3 -> MPU6050 VCC`
- `ESP32 GND -> MPU6050 GND`
- `ESP32 GPIO21 -> MPU6050 SDA`
- `ESP32 GPIO22 -> MPU6050 SCL`

- `ESP32 5V/VIN -> ACS712 VCC`
- `ESP32 GND -> ACS712 GND`

## 2. Sortie ACS712 vers ESP32

Ne branche pas la sortie `OUT` du ACS712 directement sur l'ESP32.

Fais ce diviseur:

- `ACS712 OUT -> resistance 10k -> noeud ADC`
- `noeud ADC -> ESP32 GPIO35`
- `noeud ADC -> resistance 20k -> GND`

Donc:

- `OUT` du ACS712 entre dans `10k`
- l'autre cote du `10k` va au `GPIO35`
- sur ce meme point `GPIO35`, tu mets aussi une `20k` vers `GND`

## 3. Chemin puissance moteur dans ACS712

- `+ alimentation moteur -> IP+ du ACS712`
- `IP- du ACS712 -> + moteur`
- `- moteur -> - alimentation moteur`

## 4. Protection moteur

- diode `1N4007` en parallele sur le moteur
- bague argentee -> `moteur +`
- autre cote -> `moteur -`

- condensateur `1000 uF / 10 V` en parallele sur l'alimentation moteur
- `+` du condensateur -> `+ alimentation moteur`
- `-` du condensateur -> `- alimentation moteur`

## 5. Important

- avec `ACS712`, le chemin puissance est isole du cote signal
- garde bien `ACS712 GND` avec `ESP32 GND`
- le `MPU6050` reste exactement comme avant
- ce code suppose un `ACS712 5A`
- si ton module est `20A` ou `30A`, il faut changer la sensibilite dans le fichier `.ino`

## 6. Stabilite obligatoire pour une vraie demo

Si le flux se bloque quand le moteur tourne, le probleme principal est en general le bruit electrique du moteur, pas seulement le capteur de courant.

Ajoute ces elements:

- `100 nF` ceramique directement **sur les bornes du moteur**
  - une patte sur `moteur +`
  - une patte sur `moteur -`
  - soude-le le plus pres possible du moteur

- garde aussi le `1000 uF` en parallele sur l'alimentation moteur

- fais des fils moteur **courts** et si possible torsades ensemble

- eloigne physiquement:
  - les fils moteur
  - les fils alimentation moteur
  - des fils `SDA/SCL` du `MPU6050`
  - et du fil `OUT` du `ACS712` vers `GPIO35`

- garde une masse commune propre:
  - `GND alimentation moteur`
  - `GND ESP32`
  - `GND ACS712`
  - `GND MPU6050`

## 7. Option tres utile pour un affichage vraiment fiable OFF/ON

Si tu veux que la page sache avec certitude que le moteur est alimente ou coupe, ajoute un **sense fil alimentation moteur** vers un GPIO ESP32 avec diviseur resistif.

Exemple simple:

- `+ alimentation moteur -> 100k -> noeud sense`
- `noeud sense -> GPIO34` ou autre entree ADC libre
- `noeud sense -> 47k -> GND`

Avec ca:

- moteur non alimente = l'ESP32 le sait vraiment
- moteur alimente = l'ESP32 le sait vraiment
- donc l'affichage `REST / RUNNING / BLOCKED` devient beaucoup plus fiable qu'en devinant seulement avec courant + vibration

## 8. Si tu veux rester en ACS712

Le montage conseille pour la demo finale est:

- `ACS712` pour le courant
- `MPU6050` pour la vibration
- `100 nF` sur le moteur
- `1000 uF` sur l'alimentation moteur
- fils moteur courts et eloignes du bus I2C
- si possible un GPIO de sense alimentation moteur

Ce montage est en general plus robuste qu'un capteur courant I2C supplementaire sur le meme bus que le `MPU6050`.
