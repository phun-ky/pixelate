# pixelate

Make a photo mosaic: a target image rebuilt from your own Google Photos.

## Setup (once)

pixelate uses the [Google Photos Picker API](https://developers.google.com/photos/picker/guides/get-started-picker). Google no longer lets apps read your albums directly, so you choose the photos in Google Photos itself: open an album, select all, and press **Done**.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Google Photos Picker API**.
2. Set up the **OAuth consent screen** (External). While the app is in Testing, add yourself as a test user.
3. Create an **OAuth client ID** of type **Desktop app**.
4. Export its credentials:

```sh
export GOOGLE_CLIENT_ID=...apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=...
npm install
```

## Use

```sh
npx pixelate connect            # sign in with Google (pick does this for you if needed)
npx pixelate pick               # choose photos in Google Photos; they download to ./tiles
npx pixelate build me.jpg       # writes mosaic.jpg
npx pixelate build me.jpg --cols 120 --size 48 --tint 0.3 --out big.jpg
```

| Option | Default | |
| --- | --- | --- |
| `--tiles`, `-t` | `tiles` | Folder of tile photos. Any folder of images works, not only one filled by `pick`. |
| `--cols`, `-c` | `80` | Tiles across. Rows follow the target's aspect ratio. |
| `--size`, `-s` | `32` | Pixel size of each tile in the output. |
| `--tint` | `0.2` | 0 to 1. How much each tile is tinted toward its cell colour. Raise it if you have few photos. |
| `--out`, `-o` | `mosaic.jpg` | Output file. |

Running `pick` again adds to `tiles/`; photos you already have are not downloaded again. The more photos you pick, the better the result; a few hundred is a good start.

Your sign-in is stored in `~/.config/pixelate/token.json`. Delete that file to sign out, and remove access at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## How it works

1. Each tile photo is cropped square and reduced to its average colour.
2. The target is shrunk to the grid size, so each pixel is one cell's colour.
3. Each cell gets the tile closest in colour (CIELAB). Reusing a tile right next to itself costs a little extra, which spreads the photos out.
4. The tiles are composited, each tinted slightly toward its cell's colour.
