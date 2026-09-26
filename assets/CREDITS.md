# Credits

Every third-party source in this repository, merged by the integrator from the `assets/credits/<wp>.md` fragments
that `node tools/fetch-assets.mjs` generates. Each download is pinned by URL and SHA-256 in `assets/sources.lock.json`
(which also lists the SHA-256 of every unpacked archive member).

## WP-P0-05

### Assets

| Asset | Provider | Author(s) | License | Made by | Used for |
| --- | --- | --- | --- | --- | --- |
| [Metal 009](https://ambientcg.com/view?id=Metal009) (`ambientcg/Metal009@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Procedural (Substance Designer) | metal_brushed |
| [Painted Plaster 017](https://ambientcg.com/view?id=PaintedPlaster017) (`ambientcg/PaintedPlaster017@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photogrammetry scan | plaster_painted |
| [Paper 005](https://ambientcg.com/view?id=Paper005) (`ambientcg/Paper005@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photo with approximated PBR maps | cardboard |
| [Rubber 004](https://ambientcg.com/view?id=Rubber004) (`ambientcg/Rubber004@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Procedural (Substance Designer) | rubber |
| [Surface Imperfections 013](https://ambientcg.com/view?id=SurfaceImperfections013) (`ambientcg/SurfaceImperfections013@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photo with approximated PBR maps | glass |
| [Wallpaper 001 A](https://ambientcg.com/view?id=Wallpaper001A) (`ambientcg/Wallpaper001A@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Procedural (Substance Designer) | wallpaper_woodchip |
| [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) (`polyhaven/concrete_floor_02@2k`) | Poly Haven | Rob Tuytel | [CC0-1.0](https://polyhaven.com/license) | Photoscan | concrete |
| [Green Metal Rust](https://polyhaven.com/a/green_metal_rust) (`polyhaven/green_metal_rust@2k`) | Poly Haven | Rob Tuytel | [CC0-1.0](https://polyhaven.com/license) | Photoscan | metal_painted |
| [Hessian 380](https://polyhaven.com/a/hessian_380) (`polyhaven/hessian_380@2k`) | Poly Haven | colormass, Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | Photoscan | fabric_curtain |
| [Leather White](https://polyhaven.com/a/leather_white) (`polyhaven/leather_white@2k`) | Poly Haven | Rob Tuytel | [CC0-1.0](https://polyhaven.com/license) | Photoscan | leather |
| [Oak Veneer 05](https://polyhaven.com/a/oak_veneer_05) (`polyhaven/oak_veneer_05@2k`) | Poly Haven | Jenelle van Heerden | [CC0-1.0](https://polyhaven.com/license) | Photoscan | laminate |
| [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) (`polyhaven/oak_wood_planks@2k`) | Poly Haven | Dimitrios Savva | [CC0-1.0](https://polyhaven.com/license) | Photoscan | wood_floor_oak |
| [Poly Wool Herringbone](https://polyhaven.com/a/poly_wool_herringbone) (`polyhaven/poly_wool_herringbone@2k`) | Poly Haven | colormass, Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | Photoscan | fabric_sofa |
| [Scuffed Cement](https://polyhaven.com/a/scuffed_cement) (`polyhaven/scuffed_cement@2k`) | Poly Haven | Dario Barresi, Dimitrios Savva | [CC0-1.0](https://polyhaven.com/license) | Photoscan | grout |
| [Stained Pine](https://polyhaven.com/a/stained_pine) (`polyhaven/stained_pine@2k`) | Poly Haven | Dario Barresi, Jenelle van Heerden | [CC0-1.0](https://polyhaven.com/license) | Photoscan | wood_floor_pine |
| [Studio Small 09](https://polyhaven.com/a/studio_small_09) (`polyhaven/studio_small_09@2k`) | Poly Haven | Sergej Majboroda | [CC0-1.0](https://polyhaven.com/license) | HDR panorama capture | preview renders (docs/art/materials) |
| [Tiled Floor 001](https://polyhaven.com/a/tiled_floor_001) (`polyhaven/tiled_floor_001@2k`) | Poly Haven | Rob Tuytel, Dimitrios Savva | [CC0-1.0](https://polyhaven.com/license) | Photoscan | tile_ceramic |

### Tools

| Tool | Author(s) | License | Used for |
| --- | --- | --- | --- |
| [KTX-Software 4.4.2 libktx_read (WebAssembly)](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2) | The Khronos Group | Apache-2.0 | tools/bin/ktx-wasm: decodes shipped KTX2 in tests/materials.test.js and tools/materials/checks.mjs |
| [KTX-Software 4.4.2 (macOS arm64 package)](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2) | The Khronos Group | Apache-2.0 | tools/bin/install-ktx.sh: ktx CLI that encodes the KTX2 textures |

### Downloads (URL and SHA-256)

- `ambientcg/Metal009@2K-PNG`
  - https://ambientcg.com/get?file=Metal009_2K-PNG.zip — 50113613 bytes — `ec6bdaeb50c06a5729d1674bc6f488662742464f0a6a73ce54db4dbdf5103575`
- `ambientcg/PaintedPlaster017@2K-PNG`
  - https://ambientcg.com/get?file=PaintedPlaster017_2K-PNG.zip — 32656875 bytes — `37273fc6baf6c3ea81626fa1b0d3b5444cfed7e1dbd8dafe6aeaaed037c3d650`
- `ambientcg/Paper005@2K-PNG`
  - https://ambientcg.com/get?file=Paper005_2K-PNG.zip — 53501268 bytes — `e3473c1fa8e3c3ba9e6edefc150c7c341ce57477e5a4d60af2bf44fceabff6d7`
- `ambientcg/Rubber004@2K-PNG`
  - https://ambientcg.com/get?file=Rubber004_2K-PNG.zip — 65382135 bytes — `62f93f7d331c8bbe3a77c717b156b106ea6bcffc57decbffa7d0b7b318a52812`
- `ambientcg/SurfaceImperfections013@2K-PNG`
  - https://ambientcg.com/get?file=SurfaceImperfections013_2K-PNG.zip — 51670994 bytes — `ac9ab676a4a62574a3ae86adc8386366a11f16f01281ff1fbfee90f0d23cd273`
- `ambientcg/Wallpaper001A@2K-PNG`
  - https://ambientcg.com/get?file=Wallpaper001A_2K-PNG.zip — 55526950 bytes — `56706980f5f030ab1c1de593e848b9fe4d85da9b628d79c96b0bc8de1353847b`
- `polyhaven/concrete_floor_02@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/concrete_floor_02/concrete_floor_02_diff_2k.png — 10037331 bytes — `c438815b55874b9bbab5befa559c9ef2b635f674ebf9415c7341f6865156b03b`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/concrete_floor_02/concrete_floor_02_nor_gl_2k.png — 25222001 bytes — `0b13102bbf79daef40b7230c20aaca402620b618e043413f1ff677c47acc2861`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/concrete_floor_02/concrete_floor_02_rough_2k.png — 7596762 bytes — `255fdd0bc8c2e6cdfafa4fd6697b6eadca4b906ed72375ef0a791de4a33151ed`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/concrete_floor_02/concrete_floor_02_ao_2k.png — 2972303 bytes — `494880eb1e65aee3855cf6c01fc7301e56c8b6feeacae2de15ec57b23000111b`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/concrete_floor_02/concrete_floor_02_disp_2k.png — 6794442 bytes — `3fb045cf1f939bd88dceec52592c417e7c2685a5c78edd7fef09adf0a6f2d082`
- `polyhaven/green_metal_rust@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/green_metal_rust/green_metal_rust_diff_2k.png — 4100810 bytes — `c9172ec45f10bca0a9c23b5f1bf462c4a85d314e1230b948bb6b96ada08e897c`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/green_metal_rust/green_metal_rust_nor_gl_2k.png — 11611798 bytes — `103eeb774e68bee61292e5a95de1b9ad040c56185c39a7485c5cefca8b064326`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/green_metal_rust/green_metal_rust_rough_2k.png — 6973000 bytes — `ed751a95fdd2be0c5552e962d54b1f5263097f8c61c11affe5ad0f8344483689`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/green_metal_rust/green_metal_rust_ao_2k.png — 2865810 bytes — `77b3964e654bea691f32a7311614e44f3c69ba12d84cae9b0fb44360adce6c27`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/green_metal_rust/green_metal_rust_disp_2k.png — 8077302 bytes — `13d587a117400fe87d778d6c3e952d3948817ae8293202a47f9024dc5ffaa74b`
- `polyhaven/hessian_380@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/hessian_380/hessian_380_diff_2k.png — 22813795 bytes — `b9ebc586936dc9aee8ed089b7510b4526abaccf432c2143858ce9f7e92cb2e54`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/hessian_380/hessian_380_nor_gl_2k.png — 22166456 bytes — `11133f99581b0a2efba9ed62a4b411a081cb2126b3835703155218b0316ebfea`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/hessian_380/hessian_380_rough_2k.png — 7966229 bytes — `96de7a6fa2bf5e4f6b9fb5fd4327a9205c8c4b9bb0e0f41eddcd1f36d9069099`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/hessian_380/hessian_380_ao_2k.png — 6915492 bytes — `0290bbed83130d416bbaee5f9650cf598d4724b01e036b559edd1cf2284399d8`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/hessian_380/hessian_380_disp_2k.png — 7556951 bytes — `93beb55d1a7f2bc2a0db4a8978a2ca741aec9ac5b4c459159ef07ff8ce36e52f`
- `polyhaven/leather_white@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/leather_white/leather_white_diff_2k.png — 8177379 bytes — `507647ca0d485b7d956e57f70d600da2777088dccbe50e8300b6c119f75b3b7c`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/leather_white/leather_white_nor_gl_2k.png — 7480079 bytes — `7766d7a06e2f1d84cb87a1b82e36bff13cc2b3daaf9a02bca15e14b491f414b6`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/leather_white/leather_white_rough_2k.png — 3008509 bytes — `e42877acb3c598f53b0a1fecf50ace66a29b56bf19b25cbc5252cd1593bc6d34`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/leather_white/leather_white_ao_2k.png — 3253395 bytes — `68c32c01a8db17f636b7c1a006a1ad279f1a0195c5132ebb46230c3539ec2892`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/leather_white/leather_white_disp_2k.png — 7534798 bytes — `44c81aef15d1e5aa09e51ccad9b8fc7bd7709a4e1e37f648c76127f90c20b60b`
- `polyhaven/oak_veneer_05@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_veneer_05/oak_veneer_05_diff_2k.png — 20434944 bytes — `e121529e36268e4f7ee125eb29668d1d737fbc263236fb413bfa2d1130e348a0`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_veneer_05/oak_veneer_05_nor_gl_2k.png — 18719449 bytes — `84f61e9822844617e04127a4357948d8664fa0878527a357cb5db18909f118fa`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_veneer_05/oak_veneer_05_rough_2k.png — 7514624 bytes — `30871bb9c236d0e94735fac24ec7b2de1362cda3e7be21d5fcd34e561465859d`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_veneer_05/oak_veneer_05_ao_2k.png — 7252743 bytes — `99f08d4a3e4028d70a12d1d53df2498b4290781408f59aca601a3ece92b909f0`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_veneer_05/oak_veneer_05_disp_2k.png — 5494953 bytes — `546f6bbe95dee8e2432366c020dad37b9b21f688ccac9f9241236badcd8f2a8f`
- `polyhaven/oak_wood_planks@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_wood_planks/oak_wood_planks_diff_2k.png — 21150963 bytes — `57510f88ef140b0a799959fd10b1d6c528a4b85d4a52bb753df792bfad9119f2`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_wood_planks/oak_wood_planks_nor_gl_2k.png — 20512520 bytes — `6b499e196c13315cd2329414a118fb2980a3226fe0481ebc43881bf67402b42b`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_wood_planks/oak_wood_planks_rough_2k.png — 7795418 bytes — `ef81f38b9c6896b40a3d36f314928cf08c566cd1a495cf3bf185a75b2cc7d7a3`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_wood_planks/oak_wood_planks_ao_2k.png — 7519277 bytes — `3870c98612d74baee6d996f89e331ae4f0c87501b08c6b088d957c89a1afbec6`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/oak_wood_planks/oak_wood_planks_disp_2k.png — 6005206 bytes — `5480de55d8ba4d09ee1ac234a5eafac577638ea9bef52eef6f320782fa7762e8`
- `polyhaven/poly_wool_herringbone@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/poly_wool_herringbone/poly_wool_herringbone_diff_2k.png — 23326893 bytes — `082803b429af58ec043b9c28062d00ed37438719a9171607616aa0a89c21af45`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/poly_wool_herringbone/poly_wool_herringbone_nor_gl_2k.png — 22564255 bytes — `59d7681f16c7547ce0b97319420c517e4116c6fec8b8dd2546d24931dcc74e94`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/poly_wool_herringbone/poly_wool_herringbone_rough_2k.png — 8048133 bytes — `d6d223720a6ee8ae9c31078074342e9890337ceae898b73ef65d1dabf6cb17b7`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/poly_wool_herringbone/poly_wool_herringbone_ao_2k.png — 7817841 bytes — `bb84358b36058dd29b4e90274fcbe212a0fdd5d4e0102c12c2e7fd50d8fdeb64`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/poly_wool_herringbone/poly_wool_herringbone_disp_2k.png — 7774989 bytes — `885d8828322889435ae1ecbc6b3f48d8459e1eb45491a072069fc30781bfa17e`
- `polyhaven/scuffed_cement@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/scuffed_cement/scuffed_cement_diff_2k.png — 21417177 bytes — `96a9839bc6b590758cc96579a15209948f29879a94dd56e0b297d90db44a91e7`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/scuffed_cement/scuffed_cement_nor_gl_2k.png — 21207947 bytes — `b950e4a4de580c31935184038f4b19f9ea70286bfc90bc474ea1be09b52be8f7`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/scuffed_cement/scuffed_cement_rough_2k.png — 9069878 bytes — `6a7fa27d9fe0dd0f1f471448d9820ac32e74a72e4d4c9b0a7d690c7cdbf2b192`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/scuffed_cement/scuffed_cement_ao_2k.png — 7975471 bytes — `6a07033d15e68af4eb1b3a42ae54abc0c1b97d7df29b6807c1bf6869c629d406`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/scuffed_cement/scuffed_cement_disp_2k.png — 6403245 bytes — `19d8ecffae513b23fbf73b438ed8e2b99b757a6ed1b62871e75a54aa7a6ae17a`
- `polyhaven/stained_pine@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/stained_pine/stained_pine_diff_2k.png — 21863665 bytes — `5b2b1402588ed56b16a88d8d58b2af5fdc32548dbe7bed7945c87c7ac8383454`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/stained_pine/stained_pine_nor_gl_2k.png — 20176776 bytes — `244e4946d03b64c8dee6c2d2dbee8e555f9ce7d016ff855729fe5e3a2e207f45`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/stained_pine/stained_pine_rough_2k.png — 12843 bytes — `71778f92af08a79c78be0a9e909d0bf3a95fba63589bcca5a1005d9a0a42f6aa`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/stained_pine/stained_pine_ao_2k.png — 12843 bytes — `71778f92af08a79c78be0a9e909d0bf3a95fba63589bcca5a1005d9a0a42f6aa`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/stained_pine/stained_pine_disp_2k.png — 6176709 bytes — `67e2134904a836bd8cfad5d1223a58a22d69d7889b6bdc4a1d79edf894488221`
- `polyhaven/studio_small_09@2k`
  - https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_09_2k.hdr — 6312947 bytes — `36724313c0fc66dab126ff90f081b85a0b1ef47be65eda1417bd20b033f0573f`
- `polyhaven/tiled_floor_001@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/tiled_floor_001/tiled_floor_001_diffuse_2k.png — 7169081 bytes — `0b2d75cdb5d442087e89f9295a420639760f819c47f03fc0fda95971378a416d`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/tiled_floor_001/tiled_floor_001_nor_gl_2k.png — 5139779 bytes — `320d8bbb283328bf374c54e58928d45f8e6e0339165d9dacfd676caca0bac077`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/tiled_floor_001/tiled_floor_001_rough_2k.png — 2413931 bytes — `28e1aa50279d7843c1b80ba2f2178bf0f9cf732ef6929a5794f81e6e82e01f84`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/tiled_floor_001/tiled_floor_001_ao_2k.png — 214745 bytes — `209b1ee4873210f70c5b5191d11bfcae009d8071fca0e8a72848a49c7e349b7e`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/tiled_floor_001/tiled_floor_001_displacement_2k.png — 7121686 bytes — `a5e49db415d0f9b7ef048e8fed14bf922dc23e8f6054b0f4267ae36d4e2e03c8`
- `tools/ktx-software-libktx_read@4.4.2`
  - https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Web-libktx_read.zip — 383090 bytes — `dbade8edfbbae4a8aa432d98a61b374c906fe062545c43f95ccace78e9af0465`
- `tools/ktx-software@4.4.2-darwin-arm64`
  - https://github.com/KhronosGroup/KTX-Software/releases/download/v4.4.2/KTX-Software-4.4.2-Darwin-arm64.pkg — 6785364 bytes — `500bd8f9d63358c3f3a0d83b724c8574436a72c37dc0e4bad90ec1ca38032c3c`

## WP-P0-06

### Downloaded sources

| Source | Provider | Author(s) | License | Files | Used for |
| --- | --- | --- | --- | --- | --- |
| [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) (`kenney/impact-sounds`) | Kenney | Kenney Vleugels (Kenney.nl) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1 | sfx:door-bang, sfx:door-knock, sfx:footstep-tile, sfx:footstep-wood, sfx:pickup |
| [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (`kenney/interface-sounds`) | Kenney | Kenney Vleugels (Kenney.nl) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1 | ui:ui-confirm, ui:ui-error |
| [Kenney RPG Audio](https://kenney.nl/assets/rpg-audio) (`kenney/rpg-audio`) | Kenney | Kenney Vleugels (Kenney.nl) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1 | sfx:door-bang, sfx:door-knock, sfx:footstep-wood, sfx:pickup |
| [Kenney UI Audio](https://kenney.nl/assets/ui-audio) (`kenney/ui-audio`) | Kenney | Kenney Vleugels (Kenney.nl) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1 | ui:ui-click |
| [Versilian Community Sample Library (VCSL): Anvil](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil) (`vcsl/anvil`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 6 | music:anvil, music:horde |
| [Versilian Community Sample Library (VCSL): Concert bass drum](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202) (`vcsl/bass-drum`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 4 | music:bass-drum, music:horde, music:horde-end, music:night-to-horde |
| [Versilian Community Sample Library (VCSL): Vibraphone, bowed](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Vibraphone/Bowed) (`vcsl/bowed-vibraphone`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2 | music:bowed-vibraphone, music:night |
| [Versilian Community Sample Library (VCSL): Brake drum, hammer](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Brake%20Drum) (`vcsl/brake-drum`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 4 | music:brake-drum, music:horde |
| [Versilian Community Sample Library (VCSL): Suspended cymbal: hits, swells, rolls](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201) (`vcsl/cymbal`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 4 | music:cymbal, music:ending, music:horde, music:horde-end, music:night-to-horde |
| [Versilian Community Sample Library (VCSL): Tam-tam (gong)](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Gong%201) (`vcsl/gong`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 1 | music:gong, music:horde-end |
| [Versilian Community Sample Library (VCSL): Upright piano (Knight), sustains](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains) (`vcsl/piano`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 32 | music:day, music:ending, music:horde, music:horde-end, music:night, music:night-to-horde, music:piano |
| [Versilian Community Sample Library (VCSL): Upright piano (Knight), pedal noise](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal) (`vcsl/piano-pedal`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 8 | music:day, music:ending, music:horde-end, music:night |
| [Versilian Community Sample Library (VCSL): Concert toms, mallets](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones) (`vcsl/toms`) | VCSL (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 8 | music:horde, music:toms |
| [VSCO 2 Community Edition: Contrabass, pizzicato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz) (`vsco2ce/basses-pizz`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 11 | music:basses-pizz, music:day |
| [VSCO 2 Community Edition: Contrabass, spiccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic) (`vsco2ce/basses-spic`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 8 | music:basses-spic, music:horde, music:night-to-horde |
| [VSCO 2 Community Edition: Contrabass, sustain (no vibrato)](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV) (`vsco2ce/basses-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 11 | music:basses-sus, music:ending, music:horde-end, music:night |
| [VSCO 2 Community Edition: Bassoon, staccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac) (`vsco2ce/bassoon-stac`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 22 | music:bassoon-stac, music:pre-outbreak |
| [VSCO 2 Community Edition: Cello section, pizzicato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT) (`vsco2ce/celli-pizz`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 24 | music:celli-pizz, music:pre-outbreak |
| [VSCO 2 Community Edition: Cello section, spiccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic) (`vsco2ce/celli-spic`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 15 | music:celli-spic, music:horde, music:night-to-horde |
| [VSCO 2 Community Edition: Cello section, sustain vibrato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib) (`vsco2ce/celli-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 7 | music:celli-sus, music:day, music:ending, music:horde-end, music:night |
| [VSCO 2 Community Edition: Cello section, tremolo](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem) (`vsco2ce/celli-trem`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5 | music:celli-trem, music:night-to-horde |
| [VSCO 2 Community Edition: Clarinet, staccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac) (`vsco2ce/clarinet-stac`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 16 | music:clarinet-stac, music:pre-outbreak |
| [VSCO 2 Community Edition: Clarinet, long sustain](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong) (`vsco2ce/clarinet-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 11 | music:clarinet-sus, music:day |
| [VSCO 2 Community Edition: Claves](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion) (`vsco2ce/claves`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5 | music:claves, music:pre-outbreak |
| [VSCO 2 Community Edition: Flute, sustain (no vibrato)](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV) (`vsco2ce/flute-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5 | music:day, music:flute-sus |
| [VSCO 2 Community Edition: Glockenspiel](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock) (`vsco2ce/glockenspiel`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 4 | music:day, music:ending, music:glockenspiel, music:pre-outbreak |
| [VSCO 2 Community Edition: Concert harp](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp) (`vsco2ce/harp`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 8 | music:day, music:harp |
| [VSCO 2 Community Edition: French horn, staccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac) (`vsco2ce/horn-stac`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 10 | music:horde, music:horn-stac, music:night-to-horde |
| [VSCO 2 Community Edition: French horn, sustain](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus) (`vsco2ce/horn-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 7 | music:ending, music:horde, music:horde-end, music:horn-sus, music:night-to-horde |
| [VSCO 2 Community Edition: Marimba](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba) (`vsco2ce/marimba`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 5 | music:marimba, music:pre-outbreak |
| [VSCO 2 Community Edition: Snare drum, snares on](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion) (`vsco2ce/snare`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 9 | music:horde, music:pre-outbreak, music:snare |
| [VSCO 2 Community Edition: Timpani, hits](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani) (`vsco2ce/timpani`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 28 | music:horde, music:horde-end, music:night, music:night-to-horde, music:timpani |
| [VSCO 2 Community Edition: Timpani, rolls](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls) (`vsco2ce/timpani-roll`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 10 | music:ending, music:horde, music:night-to-horde, music:timpani-roll |
| [VSCO 2 Community Edition: Tenor trombone, staccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac) (`vsco2ce/trombone-stac`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 10 | music:horde, music:night-to-horde, music:trombone-stac |
| [VSCO 2 Community Edition: Tenor trombone, sustain](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus) (`vsco2ce/trombone-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 8 | music:horde, music:horde-end, music:night-to-horde, music:trombone-sus |
| [VSCO 2 Community Edition: Tuba, staccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac) (`vsco2ce/tuba-stac`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 9 | music:horde, music:horde-end, music:night-to-horde, music:tuba-stac |
| [VSCO 2 Community Edition: Viola section, spiccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic) (`vsco2ce/violas-spic`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 7 | music:horde, music:violas-spic |
| [VSCO 2 Community Edition: Viola section, sustain vibrato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib) (`vsco2ce/violas-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 6 | music:day, music:ending, music:night, music:violas-sus |
| [VSCO 2 Community Edition: Violin section, pizzicato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz) (`vsco2ce/violins-pizz`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 12 | music:pre-outbreak, music:violins-pizz |
| [VSCO 2 Community Edition: Violin section, spiccato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic) (`vsco2ce/violins-spic`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 15 | music:horde, music:violins-spic |
| [VSCO 2 Community Edition: Violin section, sustain vibrato](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib) (`vsco2ce/violins-sus`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 14 | music:ending, music:night, music:violins-sus |
| [VSCO 2 Community Edition: Violin section, tremolo](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem) (`vsco2ce/violins-trem`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 6 | music:horde, music:night-to-horde, music:violins-trem |
| [VSCO 2 Community Edition: Xylophone](https://github.com/sgossner/VSCO-2-CE/tree/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo) (`vsco2ce/xylophone`) | VSCO 2 Community Edition (GitHub) | Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 4 | music:pre-outbreak, music:xylophone |

VSCO 2 Community Edition and VCSL ask for credit to Versilian Studios / Sam Gossner (and Ivy Audio / Simon
Dalzell for the Knight upright piano); Kenney assets credit Kenney Vleugels (kenney.nl). All are CC0 1.0.

### Made for this project (LicenseRef-Original)

Composed, synthesized or mixed by the scripts in `tools/music/` and `tools/audio/` from the sources above;
no other material.

| Asset | What | Made from |
| --- | --- | --- |
| `audio/amb-horde-crowd` | The horde outside: a crowd of zombies (stereo loop) | synthesis (tools/audio/sfx/) |
| `audio/amb-night-street` | The street at night: wind and far-off moans (stereo loop) | synthesis (tools/audio/sfx/) |
| `audio/amb-roomtone` | Apartment room tone at night (stereo loop) | synthesis (tools/audio/sfx/) |
| `audio/cooking-sizzle` | Food sizzling in a pan (loop) | synthesis (tools/audio/sfx/) |
| `audio/door-bang` | A zombie banging against the door | kenney/impact-sounds, kenney/rpg-audio |
| `audio/door-knock` | Knocking on the apartment door | kenney/impact-sounds, kenney/rpg-audio |
| `audio/footstep-tile` | Footsteps on the kitchen tiles | kenney/impact-sounds |
| `audio/footstep-wood` | Footsteps on the wooden floor (indoor shoes) | kenney/impact-sounds, kenney/rpg-audio |
| `audio/generator` | Petrol generator running (loop) | synthesis (tools/audio/sfx/) |
| `audio/ir-apartment` | Room impulse response: Apartment living room (furnished, 5.2 × 4.0 × 2.6 m) | acoustic model (tools/audio/spaces.mjs) |
| `audio/ir-basement` | Room impulse response: Concrete basement (9 × 7 m, 2.3 m ceiling) | acoustic model (tools/audio/spaces.mjs) |
| `audio/ir-outdoors` | Room impulse response: Street between apartment blocks | acoustic model (tools/audio/spaces.mjs) |
| `audio/ir-shop` | Room impulse response: Corner shop (16 × 11 × 3.6 m, shelving) | acoustic model (tools/audio/spaces.mjs) |
| `audio/ir-stairwell` | Room impulse response: Concrete stairwell (3 × 6 m, 12 m high) | acoustic model (tools/audio/spaces.mjs) |
| `audio/music-day` | Day | vcsl/piano, vcsl/piano-pedal, vsco2ce/basses-pizz, vsco2ce/celli-sus, vsco2ce/clarinet-sus, vsco2ce/flute-sus, vsco2ce/glockenspiel, vsco2ce/harp, vsco2ce/violas-sus |
| `audio/music-ending` | Ending | vcsl/cymbal, vcsl/piano, vcsl/piano-pedal, vsco2ce/basses-sus, vsco2ce/celli-sus, vsco2ce/glockenspiel, vsco2ce/horn-sus, vsco2ce/timpani-roll, vsco2ce/violas-sus, vsco2ce/violins-sus |
| `audio/music-horde` | Horde | vcsl/anvil, vcsl/bass-drum, vcsl/brake-drum, vcsl/cymbal, vcsl/piano, vcsl/toms, vsco2ce/basses-spic, vsco2ce/celli-spic, vsco2ce/horn-stac, vsco2ce/horn-sus, vsco2ce/snare, vsco2ce/timpani, vsco2ce/timpani-roll, vsco2ce/trombone-stac, vsco2ce/trombone-sus, vsco2ce/tuba-stac, vsco2ce/violas-spic, vsco2ce/violins-spic, vsco2ce/violins-trem |
| `audio/music-horde-end` | Horde end | vcsl/bass-drum, vcsl/cymbal, vcsl/gong, vcsl/piano, vcsl/piano-pedal, vsco2ce/basses-sus, vsco2ce/celli-sus, vsco2ce/horn-sus, vsco2ce/timpani, vsco2ce/trombone-sus, vsco2ce/tuba-stac |
| `audio/music-night` | Night | vcsl/bowed-vibraphone, vcsl/piano, vcsl/piano-pedal, vsco2ce/basses-sus, vsco2ce/celli-sus, vsco2ce/timpani, vsco2ce/violas-sus, vsco2ce/violins-sus |
| `audio/music-night-to-horde` | Night to horde | vcsl/bass-drum, vcsl/cymbal, vcsl/piano, vsco2ce/basses-spic, vsco2ce/celli-spic, vsco2ce/celli-trem, vsco2ce/horn-stac, vsco2ce/horn-sus, vsco2ce/timpani, vsco2ce/timpani-roll, vsco2ce/trombone-stac, vsco2ce/trombone-sus, vsco2ce/tuba-stac, vsco2ce/violins-trem |
| `audio/music-pre-outbreak` | Pre-outbreak | vsco2ce/bassoon-stac, vsco2ce/celli-pizz, vsco2ce/clarinet-stac, vsco2ce/claves, vsco2ce/glockenspiel, vsco2ce/marimba, vsco2ce/snare, vsco2ce/violins-pizz, vsco2ce/xylophone |
| `audio/pickup` | Picking up an item | kenney/rpg-audio, kenney/impact-sounds |
| `audio/rain` | Rain on the street (stereo loop) | synthesis (tools/audio/sfx/) |
| `audio/test-60s` | Survival Log — 60-second audio test | the assets it mixes |
| `audio/thunder` | Thunder, near to distant (street acoustics baked in) | synthesis (tools/audio/sfx/) |
| `audio/ui-click` | Interface click | kenney/ui-audio |
| `audio/ui-confirm` | Interface confirm | kenney/interface-sounds |
| `audio/ui-error` | Interface error | kenney/interface-sounds |
| `audio/zombie-groan` | Zombie groans (synthesized voice) | synthesis (tools/audio/sfx/) |

### Tools (installed system-wide, not shipped)

| Tool | License | Used for |
| --- | --- | --- |
| [FFmpeg](https://ffmpeg.org) | LGPL-2.1+ / GPL | decoding sources, EBU R128 loudness and true-peak measurement |
| [SoX](https://sox.sourceforge.net) with libvorbis | GPL-2.0+ / LGPL-2.1+ (libvorbis BSD) | Ogg Vorbis encoding |

### Sources tried and not used

- https://sonniss.com/gameaudiogdc (2026-09-22): HTTP 403 to scripted requests (browser user agent too); the bundles are multi-GB archives without per-file downloads, so the lane uses Kenney packs and synthesis instead
- https://gdc.sonniss.com/ (2026-09-22): HTTP 403 to scripted requests (browser user agent too); the bundles are multi-GB archives without per-file downloads, so the lane uses Kenney packs and synthesis instead
- https://sonniss.com/gdc-bundle-license/ (2026-09-22): HTTP 403 to scripted requests (browser user agent too); the bundles are multi-GB archives without per-file downloads, so the lane uses Kenney packs and synthesis instead

### Downloads (URL, bytes, SHA-256)

- `kenney/impact-sounds`
  - https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip — 800850 bytes — `029d734af1582474edf3a694d1b0cebc97c1c152f2f39fa34d4c2bafc5de77f8`
- `kenney/interface-sounds`
  - https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip — 834536 bytes — `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232`
- `kenney/rpg-audio`
  - https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip — 964837 bytes — `6dbeaf8544da958d8f2adcb4a4a4b76c1ade34a05f8ab9edccd327da7375f38b`
- `kenney/ui-audio`
  - https://kenney.nl/media/pages/assets/ui-audio/490d233f68-1677590494/kenney_ui-audio.zip — 411949 bytes — `946fc23a63d535d693eb31b2eabb80c8c28d6351e2186b344ceb71b2cb1d5eb6`
- `vcsl/anvil`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit1_v2_rr1_Mid.wav — 267524 bytes — `78b1054650cbb3df556307d77b44db00af0bf249e0a8f5ef7a1a2915bb935792`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit1_v3_rr1_Mid.wav — 410320 bytes — `f832799b7cabeb06163a18ac49d373d21bc5271fc316f9f61e6d6f17ef669a18`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit2_v2_rr1_Mid.wav — 348984 bytes — `5a104c9e7309b0b99f0f56d023959a0fc21000d886bcaee8f85b8dccf3b9afd1`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit2_v3_rr1_Mid.wav — 360728 bytes — `1482a60b6da77eecb02dea1710ddc9c6711db4bb6feb0b113cba5de4cf188b0b`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit3_v2_rr1_Mid.wav — 253444 bytes — `165478918d93226fcf41c8e35fba34a7f2da88bdb9ae0a6e551f7bcb1c6830f4`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Anvil/Anvil_Hit3_v3_rr1_Mid.wav — 332684 bytes — `ef9127b7d0e9fa026cfaefee06d9383c349cab00a9d63dd1ebdd3c9c6841d12e`
- `vcsl/bass-drum`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202/bassdrum_hit_f.wav — 1933602 bytes — `e2f909d4986e2502b0653858c47bd10b0914c5893da770eae3034a9431e31439`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202/bassdrum_hit_ff.wav — 2198042 bytes — `d0ce17649553655127ee27dff312ece64c9ac698a9b66a470c3b51f244892c7b`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202/bassdrum_hit_mf1.wav — 1888698 bytes — `9cfa91a11fad6c843e001ad6365949200e2d5b4237cf1193a1493310f0f6c3c1`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Bass%20Drum%202/bassdrum_hit_mf2.wav — 1760210 bytes — `cd6b4e0c68c6b99466f1f62ab4cd4dad43de559306a123406433f13907495bd2`
- `vcsl/bowed-vibraphone`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Vibraphone/Bowed/Vibes_bowed_D4_rr1_Main.wav — 2879664 bytes — `b5a6ab0a6c51b446832bc3686e27a62489f3169182ad4c872698912536d1ece6`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Vibraphone/Bowed/Vibes_bowed_G3_rr1_Main.wav — 2911628 bytes — `4b566300ee58c75de89e97278607f710ba0a807622582118d9f2e451d8bf573c`
- `vcsl/brake-drum`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Brake%20Drum/BrakeDrum1_Hammer_v2_rr1_Mid.wav — 282756 bytes — `c9e7b154d4a5eb6075178cb27ca34582352d18049be2cb73b466db0a39f417e0`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Brake%20Drum/BrakeDrum2_Hammer1_v2_rr1_Mid.wav — 292616 bytes — `cd1b6ee78ba1127b0f85d4a135139120070b7efd6a340d3f2b88db72adedf0c4`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Brake%20Drum/BrakeDrum2_Hammer3_v2_rr1_Mid.wav — 237272 bytes — `b1eb38634f71eff408c418f8df489c468b723e05295ee7fd3adda240778fa151`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Brake%20Drum/BrakeDrum2_Hammer3_v3_rr1_Mid.wav — 252308 bytes — `3a14ce55e4b27cfaa809e41bdcaf8f588c606cbf8eaebb642d61332cd576ed12`
- `vcsl/cymbal`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_cresc_2s.wav — 1837622 bytes — `a5507bf116b33ee220f4eff54506be56fd455e908c8d53903f217590341e5008`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_cresc_4s.wav — 2291710 bytes — `bb3b6b251b0b9dac23b7b0fae47aab84a70abbefa4a110b05c9f4ad733e70741`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_hit_f1.wav — 2046894 bytes — `42a8ece91eccec9b7063793e6644d037a9005c01d5b76f6bec358e8d53fb92a5`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Suspended%20Cymbal%201/susCymb1_hit_fff1.wav — 2285114 bytes — `993ceb041adaad19c88042e9d6e66707c30eda6e44a5a263d68bb4a3cdb2ca02`
- `vcsl/gong`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Gong%201/gong_fff.wav — 4822774 bytes — `998b27e21ee1639a73c1d71c8093e98cab4a10223640a59e8902ecfc557f74ac`
- `vcsl/piano`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_A0.wav — 4936726 bytes — `80ade36a6030d83d868b6abbd1e9ab6f85ec2494cfe25d2affffd88f453e81e0`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_A1.wav — 6306106 bytes — `9accd92b779985736589d7bf25b93f1d6d508830d2f2aad3e76a481549cc1ca2`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_A2.wav — 5748202 bytes — `fb39ae501f7dde4aa3626d2e382b3709962cbe5d48b6c001ba7c911d1ffb6aeb`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_A3.wav — 3204940 bytes — `a00ae1a2b2a78c154b067a9709afc1ce2d3be9f08d9f4ad3c9c869a7db80eb75`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_A4.wav — 3144364 bytes — `4b558995c108f7f1dcede12c7e0444caa2658205fea34a314abf485dc6b7e710`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_B0.wav — 6109564 bytes — `45084b88e5130f7a3cfd9bf79b2ae063674021f55c4fdabc2f86253307b67fb6`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_B1.wav — 5554372 bytes — `fe94341bcc16c0ecc893ab9c3af8fb5a406bcb9a15d77d8c1e0ca268a53cd752`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_B2.wav — 4470514 bytes — `bb97f6b491ff106b8dbad5e72446d046c4409bdc1d82ed3c009d3847d859c09f`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_C%230.wav — 6074254 bytes — `2ba9838d073b9dec7ed19a4b2b3ba608f62a8a1c89694d7ef1f1afd47406683f`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_C%231.wav — 6862312 bytes — `52be11ac2a57389f2d12cbd82df9b175da7b60e423d8a1154e1d7fc3340ecd6e`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_C%232.wav — 6180628 bytes — `0bdf66b89c2cd8042118b2cf9898aab334820fff7538b8553655a3d11d2ba107`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_C%233.wav — 4346848 bytes — `dc314226819e7af0768cd7fc08933f5e5b550083145e05af630fd7556f4d3913`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_C%234.wav — 2656870 bytes — `4e668e75c3922c79ef06bd46806224dbf8dbfa0be1569847a1cd17e573a967ec`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_D%231.wav — 6133414 bytes — `83b6c680921d68b9ab06dfdcebe660ccb227cd52ac32e94e31a1a90ccfee795d`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_D%232.wav — 5285302 bytes — `ac731830a4bba3baa31f774f6bb300d9faf459e3de129f3a3c76de9078f4907c`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_D%233.wav — 4126108 bytes — `1102aef8803aa91be0753706441666fc8e844341be70806abb1e276d4085539b`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_D%234.wav — 3320278 bytes — `d1483294022dab8ae51c2909c6c91ea0130d8950a05ce3df6bd0ef8ddb4283c4`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_F1.wav — 7572904 bytes — `324c53abf03b2b32ff74f52886806ab5d4a7a37f6eb9c746558799037d7e12da`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_F2.wav — 4643212 bytes — `87b90b8161b5ddac5f1e81cce7895c726aff220e735586059c7ed684a5ae82dc`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_F3.wav — 4476550 bytes — `9a4e03fa389b7e59ea6b3a6719eef52be8d607844283c7163662030f57b60942`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_F4.wav — 3008866 bytes — `84fe87bd24dc93d354213f730517a29f485c40715d5959af97976b364110b70a`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_G0.wav — 5096770 bytes — `2183a523ac1f60cd3ee34b89953edda53d47f42a1d8bad8af09f14d6a5b007ac`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_G1.wav — 6599956 bytes — `063bb787069c29489410b5cb7b7d14740b2cf331840a5de254fe5f1b33de7cbf`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_G2.wav — 4494526 bytes — `3f422ce7ab1bc85a238d3b19f3d07789009cc4e0080f66d97f6036ce5b4618f4`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_G3.wav — 4545196 bytes — `ad3b8eddf0de3a09fb584915222ac8da91fa229680b0e4285e62f9974746da86`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl1_rr1_G4.wav — 3052366 bytes — `dcb4ac3f0a810b4b7eb860596203764c10dd3fc9b3cb334f611029f908bf4842`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_A1.wav — 6153220 bytes — `ac6644ffc1aa25d194f024d3abdae4f06d6dff1ae42ba2a7e8edc1fddcdff12b`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_C%230.wav — 6462502 bytes — `3937efc793df279be101d0964cb46e3b2480f855ddb95d55f7e250eaaf725fac`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_C%231.wav — 7063150 bytes — `19080adc5446961073aaeca7d5f5594cdd7c409ee0ffb95231400dfd8c2fd947`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_C%232.wav — 5030746 bytes — `d1d7318686f6a5ae0e78560c171bb8f9cb4bffa3d2115f6e1ed32b5d4d07f81b`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_F2.wav — 5759260 bytes — `bbf92571a777aeadee8751bba780b8a9a0b5913980c252d805acde2069bedb89`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Sustains/Player_vl2_rr1_F3.wav — 4898926 bytes — `c2c1f3d7f6ffa05d2a840094a3191537445436bc1ef6efe01af7f0876a39d06e`
- `vcsl/piano-pedal`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/Off/Player_PedOff_000.wav — 854860 bytes — `b7e365c9ed532358e57e3cf6fc5991a74c947ed428174250d0113f83b0b3b611`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/Off/Player_PedOff_001.wav — 900634 bytes — `4eca27f42a7a216c9d3bb6d28233c0f5c78d21c84fec98435032f26c6b3c2fb8`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/Off/Player_PedOff_002.wav — 767284 bytes — `9a819f4fb91042f8a68ad076bae001fcd8395c918f7b057378049e2225174b45`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/Off/Player_PedOff_003.wav — 1188514 bytes — `965c5bb23806689e0c65f5cddf43e7dac8c1237f19fbf41dfe3bb36f68792e5a`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/On/Player_PedOn_000.wav — 1006486 bytes — `951504c9e91efd69208dbbed3140256efaa8feb0ae6a59d898a4b13626d7192d`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/On/Player_PedOn_001.wav — 1452796 bytes — `2a71dd6073da7bf4688bfc5cbde2185570f680082bbe5a4e40fb52f45ec31ce5`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/On/Player_PedOn_002.wav — 1140082 bytes — `749eec0202f893400e881ae9a9335dfe436bc7ea58ed6101004c0f8c7b781f33`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Chordophones/Zithers/Upright%20Piano%2C%20Knight/Pedal/On/Player_PedOn_003.wav — 1185328 bytes — `dc931d0595c9fb9b43b39bb37c1199f311b49c48f562af88c6033f6cb6ad4f4d`
- `vcsl/toms`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%201/Mallet/TomH_HitM_v3_rr1_Mid.wav — 497412 bytes — `f39c17ddb76504dcab90d0d14bbf2b722eda87eb533401a662a3ef454b76bea0`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%201/Mallet/TomH_HitM_v3_rr2_Mid.wav — 460900 bytes — `835e8c61672c0ab87afab3c65de5c50f168fbebeac4013e2e919d4d7a1f4d360`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%201/Mallet/TomH_HitM_v4_rr1_Mid.wav — 462416 bytes — `a57ac74e93079d72c0cde41ac97391db757a450a167e85f115b7248a726c9b02`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%201/Mallet/TomH_HitM_v4_rr2_Mid.wav — 493220 bytes — `9264c223229aeb76b73302d3e6be15e147e6a346f0260556d9a9615b8c52ea0c`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%202/Mallet/TomL_HitM_v3_rr1_Mid.wav — 421476 bytes — `d882ba9eb8b094519f7d4defd832c375b49fa12f2c094979a7ed3b559ba25b21`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%202/Mallet/TomL_HitM_v3_rr2_Mid.wav — 417812 bytes — `d0aecf41b4af5f164e4900858a975c79a73455ccad90c64a709722d5baaf11f1`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%202/Mallet/TomL_HitM_v4_rr1_Mid.wav — 416188 bytes — `8ee010beab0edb64ce7f580a433f4e4ab1d07874dcf8e74b0edad9e0fe8b4639`
  - https://github.com/sgossner/VCSL/raw/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Membranophones/Struck%20Membranophones/Tom%202/Mallet/TomL_HitM_v4_rr2_Mid.wav — 554524 bytes — `877ff4b4c3baf395cb8fb2530bb98dcbd385ec059c5a4b0f5c5ddc9078202112`
- `vsco2ce/basses-pizz`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_A%230_v1_rr1.wav — 344328 bytes — `c172382a1c8db63d1893e909da3c0f7f96a60371dce0cfe712e64fd622066fbe`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_A%230_v1_rr2.wav — 326372 bytes — `a82a509344a7e03e81f937b0daf647d55c3d47ec01867deeb41463d1d39209af`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_A%230_v3_rr1.wav — 417360 bytes — `ffdcf783332627d78bb09c348ce5bbf64e833d529a1cfd48e05362f27a857c0a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_C1_v1_rr1.wav — 270720 bytes — `5591160a867b21ba193d601390c9e1f35ec8d5deb0de686a410d25a98a103b06`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_C1_v1_rr2.wav — 405984 bytes — `d880b29cafc4b537a5097c9b65a7e20d1be15d60efaf7ceb15e20517b6ad455b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_D1_v1_rr1.wav — 856252 bytes — `c4db29ae6949cb6c0d24201bb444c1d5b3806505bae47785cb199f5f0f4f02d2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_D1_v1_rr2.wav — 1062672 bytes — `4f17f7c828a9d9123c8c6498a27aa6b7a2772a5b937183f3d622f41f56ce21ce`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_E1_v1_rr1.wav — 294356 bytes — `818fd3e7cc5200774333fc5dbb37e021ed0f155918cafe129acc0e90d37f9d49`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_E1_v1_rr2.wav — 315292 bytes — `9b87c1440edb95a70ca997ac83cff0d0e84c176f6269a59f86ce381f339f09ce`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_G0_v1_rr1.wav — 169640 bytes — `6c8ed06c816b2aee6443a3df4d8c24dd05d1e6fa72595d47b0e3755cd251e60f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Pizz/BKCtbss_Pizz_G0_v1_rr2.wav — 240624 bytes — `805a41b3a153a8601c9308a106c33604030ff7f3c0c944a92b25663a1baa7873`
- `vsco2ce/basses-spic`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_A%230_v3_rr1.wav — 260456 bytes — `34280d744690957c3668e650f9c5d86a3d5a71a524c42742b34c8ec7ffb8c6eb`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_A%230_v3_rr2.wav — 311856 bytes — `b5f819e0869d215a7e9336c8203e637cebc93b73af8d48931e5f5b8d64f766e9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_C1_v3_rr1.wav — 239208 bytes — `4bca4ab782cdbddeb75069135a4a8b0e4bc4f3570a5033b7f0729b5285719ae2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_C1_v3_rr2.wav — 238012 bytes — `de2dafcc37ed8ea565836a64d919c6860e1a57779b6f4bbefc5d557dc0254739`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_D1_v3_rr1.wav — 305376 bytes — `39b0d060f6781ed356f4b9153b1fcd96ad79b8548164ece0be5314fb8e48d21b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_D1_v3_rr2.wav — 271904 bytes — `f6d56d8a3b58d8ebc2c2f32724e89f7e5c4b513c78af4461ed51f2c8dab37191`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_E1_v3_rr1.wav — 381272 bytes — `08209aecd7ab8d6de7f3f4a442f12b108327f6c95ceb7fdff2657e149de03040`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/Spic/BKCtbss_Spic_E1_v3_rr2.wav — 290536 bytes — `9cc0f8272f00ee56c5bc85caccca76099d91f86ac6063d615cb5e283bfd84b4e`
- `vsco2ce/basses-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A%230_v1_rr1.wav — 1861432 bytes — `b3800588b7aeff8f0c81998bdc4bfe47b3fc3e621f166de3df68f614a9f53afd`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_A%230_v3_rr1.wav — 1786876 bytes — `3a8ba2d2cf631a9b4732a1ca717a7059d20b71a9db576ae4fa5346d024cd17e8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_C1_v1_rr1.wav — 1458252 bytes — `c930941735e707b109878f4734110412ebe26b983c2b3e300510175aedf5e61c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_D1_v1_rr1.wav — 2548840 bytes — `d07634bec7bb0d736375bfb0c514f3d7586d9a625c4f56f4936556e247b33812`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_D1_v3_rr1.wav — 3209708 bytes — `da9f42632d703a139d051b4c0de3f8c5fbcece5242f06e397e910c2e3f57c1a9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E1_v1_rr1.wav — 2824612 bytes — `90428ce30d89c2eab94187a2d2c589758bc7027b8f0c8d3e2cce165972f60e21`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_E1_v3_rr1.wav — 2356332 bytes — `1f122393a2b0e771d3e9d17b122c1f4f0a5872c342d46743103250946b7dda55`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%231_v1_rr1.wav — 1322048 bytes — `a678ba2e2399b7da502628962575e904127d5f5a2a68a6ab6c4237c7281dee4b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_F%231_v3_rr1.wav — 1619688 bytes — `165cce5739a5a80c33336a2f667fc1a7ed5541bba74dfae7e3f122a70b0a0418`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G0_v1_rr1.wav — 1881520 bytes — `d363b0e026cae6e86dcb60e353672fbec2f1bab9e8ee4c95903d9fa83fd47606`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Solo%20Contrabass/SusNV/BKCtbss_SusNV_G0_v3_rr1.wav — 1934328 bytes — `129f188021438e2c103d709a550db59ba9aba9eb771a1763fdb2f57b188040fe`
- `vsco2ce/bassoon-stac`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_A2_v1_rr1.wav — 102420 bytes — `9d06ba4c8a536f5c89acc7c94d5967cfddf9a5915044908794a4bea4170fe477`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_A2_v1_rr2.wav — 97760 bytes — `e2baf30c3d2fc3819e42c967bde1b7f7c1a6c2ed568ea42c66a65fe10edc1830`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_A2_v2_rr1.wav — 132928 bytes — `f2cf7a848c9f0f470689584e1e545685d49c190a7cc0e1092480865643906aae`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_A2_v2_rr2.wav — 123256 bytes — `d3de021a82cb79bc8034768ba06f3b2272d75be9021b2a8e07c9b969cedb9287`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C2_v2_rr1.wav — 125524 bytes — `3c1104957f8f7f38ef861582ad642f1474e903dab96274ad16c51912fceda31f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C2_v2_rr2.wav — 130840 bytes — `7737678d9b3eaaaffb71f90942612fe12a6ce57a23f590f22fbccc32cd474dd0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C3_v1_rr1.wav — 117228 bytes — `efe8a7222f32181cdb752a9acc8860e47ec2a9e2f9b6dc4538f44747eed5786c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C3_v1_rr2.wav — 115880 bytes — `7a2d17e32dc51ea7351f5a3251611a78f38bec3225fcd187b2154d3ba48b894b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C3_v2_rr1.wav — 126972 bytes — `e2c3473ab074c1c8e2330c96c379e3896d77cf30b6f4a3abced62d616ee6bb1c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_C3_v2_rr2.wav — 129144 bytes — `46ef7883b13a29d83fb3d8d98207895e298ed0973b50be62e5c19f23bbc5d1e7`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E2_v1_rr1.wav — 133028 bytes — `83716ff49d0572dd83de8ab9fce8d3ac2b313a9c3dcd14d2ac94c4f726696fc3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E2_v1_rr2.wav — 125288 bytes — `52ae5924041fcd8ee9e58b9f2d091c0a8f26639c728b879d05409f8e648c9bdb`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E2_v2_rr1.wav — 137972 bytes — `5ddb4c3f0f61b5efe182c776fa1d27305c41855a175d5309064f9c030b7ae5a1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E2_v2_rr2.wav — 136176 bytes — `53016d7afd148411b236b592e1f626d246f03f4a6843eef6bd82cbc76b7aa70a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E3_v1_rr1.wav — 126936 bytes — `a6d04b47f0414d83f9fa1427ab068d814fbed208567ce838aa5357f587a53fa8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E3_v1_rr2.wav — 124928 bytes — `87b483af47c13c8a738ee986b078f6e8f5c9fe0518eb46ea9ce80d8566ceb511`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E3_v2_rr1.wav — 125328 bytes — `e71165d38d17045428d1d4bbc5e0ef7a1ee483dd1a806cd4be48eb8dcf6aee15`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_E3_v2_rr2.wav — 125344 bytes — `cbaabdcaf70c6aced9353f097d4575cb4351ce2a85d0363000db0d275d412ad4`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_G2_v2_rr1.wav — 134460 bytes — `6a3d8c9da12bcc181093047ca0c0420caa8aac014da916b69447b88ada44021a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_G2_v2_rr2.wav — 143912 bytes — `a366c8532ce92b7d50ca395c8318bf408d02419cbfe85579ece832e03f7da5e6`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_G3_v1_rr1.wav — 122860 bytes — `efbc0a901db97648f1b8eaa01693f571d1d65638c06ea594a6d3966e2abd498b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Bassoon/stac/PSBassoon_G3_v1_rr2.wav — 128528 bytes — `542c1c6e7e91f84c65172011012006c596cadfa30cc23fa2c4ff636eca28492d`
- `vsco2ce/celli-pizz`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_A2_v1_RR1.wav — 763418 bytes — `3ef328e9c07e58797bb65831edef89b1fc946013a736826b6e380776c91b1f83`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_A2_v1_RR2.wav — 714926 bytes — `819d73e9b58d28c3d3888ed566fa9802b3cb6bf5cdd314931ddeafa529ba1408`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_A2_v2_RR1.wav — 748484 bytes — `187df4d1d5621877d32cbfb3d174dcacb85aa59caf3359d9ce398bec4f7ccf56`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_A2_v2_RR2.wav — 757718 bytes — `b297e7396e6b5a327a069c8eaa378a2a1c7ce4dd3da7ba3fbc5f3c66c07e16d1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_B1_v1_RR1.wav — 890366 bytes — `33bbfc9664e8536e8931fba5c53ab4e06abeb6f75fc3b6186bcdb159d6000604`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_B1_v1_RR2.wav — 1005728 bytes — `197600ab555da6f29b368b898a089f7b8d79f9a6b7388ff3fe86560ad9ca6186`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_B1_v2_RR1.wav — 1058144 bytes — `d5898f41739b4929530aa7d4a3f1660ee2bb6096b375c1f034eb6d26cbb10623`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_B1_v2_RR2.wav — 851390 bytes — `675a55fce6f23a97281704024ed01e69cc8699fd3458fe76f22ba19b91c20348`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_C3_v1_RR1.wav — 704396 bytes — `63353870ad00cebe9882b96abcceae12480d37b78b62ded6228fb638871e8a81`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_C3_v1_RR2.wav — 668192 bytes — `87abaf14ffe66902002c378a504147861102b67af5f562bb5594835c3d647c33`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_C3_v2_RR1.wav — 762122 bytes — `fbc86686ef092e92e473dce4d1ff5f1e351dcc76ed2d94b0d336c1346f314e59`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_C3_v2_RR2.wav — 717008 bytes — `7287080f6071252812a8b88bf21c32e0985b0a584eccc4487fb282ec1211195c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_D2_v1_RR1.wav — 723014 bytes — `434925e6b7d154cfa7c17e89ccc8e4a126e01a970cabee22fe09a9fb0e462bb6`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_D2_v1_RR2.wav — 769676 bytes — `f23062710e77ca46c33fe453874f8730e80b1f7f7a769bcafdf7bcd0b6254460`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_D2_v2_RR1.wav — 770222 bytes — `5f80f5fd2f8f3f2cc33b8e7cdba1c5984b5a8158d6d34cd03fe48ae46b335461`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_D2_v2_RR2.wav — 686930 bytes — `2b25fcdf1958fabbd54f1f64b620df12af5436d074da6b5030c5f0b2dad4a250`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_E1_v2_RR1.wav — 826130 bytes — `e5dc2a92063c0d2262336239a227e686c4977b6f8aaf65a2dda13c71ffe982df`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_E1_v2_RR2.wav — 1005260 bytes — `8ae271ce5c337de9996193e66de415dc8ae322eb86bcafdcc78bbe4ec4acf4db`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_F2_v1_RR1.wav — 662600 bytes — `ff44e135372083b7c7989fc741c2ebc97bf91f11c5ba7d3c99bcf2c967f6c4e8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_F2_v1_RR2.wav — 446198 bytes — `f8a1804d48d1b0dfc48ec63e8f8de07834ed1efc83fa9a25584bc295235cc196`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_F2_v2_RR1.wav — 479312 bytes — `eb5b95b1f7b22370ad00713db544f2eb3cae6b70a29fcaf673c54d485e73c8a3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_F2_v2_RR2.wav — 537716 bytes — `2114b5d349fad4c99ae5cc12080dc0fb838490fb9f79b707446d9a5e59826859`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_G1_v2_RR1.wav — 884180 bytes — `a12366cff3dd68c4a1622bd504161caa9ed18d23f9d03ed413936a0829188cf1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/pizzT/pizzT_G1_v2_RR2.wav — 977798 bytes — `0d56d33e6665fd25f7d2aa7e97cc918fe26ab81a956cfefcadd6e17a4f116193`
- `vsco2ce/celli-spic`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_A2_v2_RR1.wav — 893588 bytes — `a0f0d6a225e5a31debd902b518b96987b322e064bd38c29f891196c06ed4b7be`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_B1_v1_RR1.wav — 460220 bytes — `f0c46e179f8b76c07097ff6ae1fe7582b05865cdbb6ff3bba9bec51c68fcb99f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_B1_v1_RR2.wav — 503720 bytes — `43e7f6f85ca9786063853f2d285918937e446cc076be032db1fbbf4434ff24e2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_B1_v2_RR1.wav — 476396 bytes — `3883a65c6d301bf6f61b21d5ec6e27f9740ba219b5b022a9e5f3a67c62aeaa2a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_B1_v2_RR2.wav — 527474 bytes — `d59af5e67b221405d69294434f72b2e3523cbf88f378bc888136839a5f4eff7a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_D2_v1_RR1.wav — 394016 bytes — `6fe41bb3cf9212480ce2e856b5da3971267f75d64b629e90224cc9c6deeb1cb2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_D2_v1_RR2.wav — 371936 bytes — `2bbe3fe396003bb294b9051d2d5f206d850bca129a748e9328b16dc893d7bdc3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_D2_v2_RR1.wav — 896108 bytes — `c647723304b5f4b2d3af02739017e38bc4e85244c15355ebd6f8443c1445b5ab`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_D2_v2_RR2.wav — 783068 bytes — `798af63a9273d686805c94427fe977c13362ba3263357ba5f1ec7db38efc628e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_F2_v2_RR1.wav — 339830 bytes — `840ea94753ece4334d62da823cd74a83c3fc8ff28166ff8a71f589d75fc6e591`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_F2_v2_RR2.wav — 399308 bytes — `f00536e596eadd7b61f944f812e7d08683ee0d7ddfedac6573516657585dfbbe`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_G1_v1_RR1.wav — 567434 bytes — `62ad206529cfa2ea5630042f2d23f6442afd1f008435a2c5e79f1b8bc924d3ec`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_G1_v1_RR2.wav — 495434 bytes — `455fac92edf6c972c06b9c4e2c99987274bc3c2ccf4b1ea937ab914dea45e891`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_G1_v2_RR1.wav — 856028 bytes — `7f536c013e9e24c0cde3577416bf27111b741fd331a0d041ff75e53eaa6102fa`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/spic/spic_G1_v2_RR2.wav — 755624 bytes — `cfdd4fae88dd559359ef65836663cf8d324f2f1f4bd81e2bc6f4e751251244c5`
- `vsco2ce/celli-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_A2_v1_1.wav — 2336738 bytes — `c97a003184fdcb153d6b6c0bae8d82a90592a1b04b06bd7caaeda8b9776d5284`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_A2_v3_1.wav — 3082676 bytes — `b7f226f19b9616abe5fa4a27ef50116667e19eb0127f30eacfa6d1a83e9149f0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_B1_v1_1.wav — 2372492 bytes — `4f95c087c4b8d87ee591e9d39c3c9caf085c6f1b9125eac3ca9e4e637da628ee`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_D2_v1_1.wav — 2550956 bytes — `e8640dec9febc6e39fcf06b19d2c95a85d5ff8c38f13c9879e69f551eaf38ab8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_D2_v3_1.wav — 3291368 bytes — `fc946615cd6550570c8f05d61c0d59b9079bf9daba8bf25be7943487fea5a7ae`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_F2_v1_1.wav — 2186012 bytes — `162054eab4ba118924f8f8986cf1b17ccfd65211d1945743ffbae30b4953f901`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/susvib/susvib_F2_v3_1.wav — 3062696 bytes — `d965197faf2e6ab8675f1d65505e5ba934a5ab769412d314bad94133e18f24d0`
- `vsco2ce/celli-trem`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem/trem_A2_v1_1.wav — 1999418 bytes — `30824d7a9448a5ec21e261e5ba051190bf68fa295d9e4b0c6ee2550496a6af3d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem/trem_A2_v2_1.wav — 2492954 bytes — `8a23cb455f982a763dcb100545044317c210fc521f9a5b970b68c2344931dbd3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem/trem_B2_v2_1.wav — 1816706 bytes — `2ce55bf91c06e69d4666a61456665a139683ad625373d8e483240ea7e1580148`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem/trem_D2_v1_1.wav — 1837130 bytes — `eedd9f86e01a16828982ebb543eb3e0321f48b02f7ab987909dbd8ea81c6ac4f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Cello%20Section/trem/trem_D2_v2_1.wav — 2194472 bytes — `1bd5cbd3b4686a1cb2180f254b612751388caa4e016824035563c64e95ccc955`
- `vsco2ce/clarinet-stac`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%233_v2_rr1_sum.wav — 115828 bytes — `1461ca3338c041c893957498a11480d7b9caa6112e9c991bc4667a22ff8a61df`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%233_v2_rr2_sum.wav — 93840 bytes — `558f2d5487dd02de5f8b5fe7d7c4bfa9ec36d7705a344bb0bbf2a5076b54160d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%233_v3_rr1_sum.wav — 108136 bytes — `8de93277e8d4a52d37723b4ea929d3235eb8fabdcdd9222675542d4fbb67c26a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%233_v3_rr2_sum.wav — 128332 bytes — `e06dc8d1b9912bb7fd253f5b050ea60d592ee5f7045e7d281106aea8292e37d0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%234_v2_rr1_sum.wav — 113488 bytes — `b498829247cbd00089d92a5636ab673b2f0a5f977c4754f71360d58f24c9f07a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%234_v2_rr2_sum.wav — 109304 bytes — `60a47b700781088f934a598e582bb2a8ddc4ab5201bbb88618e793d39cae6137`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%234_v3_rr1_sum.wav — 111108 bytes — `7eb645355b9b8a09a1e6c819e37fe4c726c3129364e40c6f9fc6f3e70bb170de`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_A%234_v3_rr2_sum.wav — 116068 bytes — `901bdf950b17714db939300c21379847436e7cbdec8f61761caa491b9f8e3de3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_D4_v2_rr1_sum.wav — 116956 bytes — `d691b4b3c557a1fe2c3ed674f0264457e801b653ef007ac26cbafbd2b36cbd99`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_D4_v2_rr2_sum.wav — 110680 bytes — `fad7878627c2abf5e0586df61434e1492968d09f91c655ae697fcc0c17641b7e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_D4_v3_rr1_sum.wav — 110360 bytes — `f181c58a5a9337106722aaf5f1b4e0a9231c6ab74d46444838d914a6af6efcad`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_D4_v3_rr2_sum.wav — 118440 bytes — `8facca86fa70f3d589d5d984a8a66fee1772d792c5cca6aa9522d8eb7128c7c9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_F4_v2_rr1_sum.wav — 105552 bytes — `317a52552509405422a4b76d8671a9c2287a2b36f96382e00213f3e2d6903318`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_F4_v2_rr2_sum.wav — 117176 bytes — `18b12ceade7643c51ee2efec569216ede2af9f1dd4b3faf54257e7f95476a693`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_F4_v3_rr1_sum.wav — 107756 bytes — `c77eec8fac60d790a481a2c7793fc035f5ac8b50439da7c3766dd673a17a674f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/stac/DCClar_stac_F4_v3_rr2_sum.wav — 108896 bytes — `d11cca3ad73f3d8d50842a5279cd5d22ca331ab28eb9bc4616fdaabbd62c8c0f`
- `vsco2ce/clarinet-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_A%232_v1_rr1_sum.wav — 1825324 bytes — `f4e51e4addda4e87e84b0a57b1de21cb447adff0a2c1aa5c71b5d3ef5618a93e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_A%232_v2_rr1_sum.wav — 1909388 bytes — `82be872b7915c833e06910846e3398b55591f69bfe6474c39dd4051742db2700`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v1_rr1_sum.wav — 1599888 bytes — `c314aa26ec148ffa30afe988d7f4f178941a38ca401f487ea2633ce635e78d3f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v2_rr1_sum.wav — 1791140 bytes — `779e2cad84f6f5103272f17cb4637a94d8e9c533a5811233595960cad61b391f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_A%233_v3_rr1_sum.wav — 2059160 bytes — `29fc72eb3b93cc297095d6cdeb54b3d819de8e4070855c565302bb0a471b0a5c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v1_rr1_sum.wav — 2230948 bytes — `74ba0ec6cb0698f314b07cee2f63cd309d5fd30db262d10d1f69e6aec9cd5896`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_D3_v2_rr1_sum.wav — 1876188 bytes — `30e686ffc58caa48bbfae309a06f1c27c75b192fb653729ffdf8586cbd9b8405`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v1_rr1_sum.wav — 1987372 bytes — `61ff877d4b500c2e1b6b51f693cd1ea8df05c7473c2ea458a207b1450495e430`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_D4_v2_rr1_sum.wav — 2047596 bytes — `4bdc53f3ef917cc9146e10cec5eb33744524e8b510c4a39c080dc5c774b3c956`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v1_rr1_sum.wav — 1762976 bytes — `0677787afa8d1fdc99e267a1518a49dacf3f1899dc27239c1fbe93568fda2222`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Clarinet/susLong/DCClar_susLong_F3_v2_rr1_sum.wav — 2069572 bytes — `3c9a237651cd049cacdf4052ef85ff406da1d9e5d4f59439c20f45a7578ff431`
- `vsco2ce/claves`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Claves1_Hit_v1_rr1_Sum.wav — 199848 bytes — `569812aca160bf35d71ac16e678f5528b2093ece086300cd97a0064e17d23f20`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Claves1_Hit_v1_rr2_Sum.wav — 181976 bytes — `059f4555b380cfc9d9bbc89f8329ee16b81b340e42dd1f21e8ca47d508015133`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Claves1_Hit_v2_rr1_Sum.wav — 191812 bytes — `ae0493fa57d0d1dd57693e8639dfe5fd9675b520a1c0c0eb45cf992f2a23ca9c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Claves1_Hit_v2_rr2_Sum.wav — 187072 bytes — `129ef8187b4c06ba995794039d01cddfcd9daad19cee6b7b950c6b7492ff6def`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Claves1_Hit_v3_rr1_Sum.wav — 228764 bytes — `5561306630b21fd9c0bfaf843c36bff29c90ea1bf84ee03c95b8996af24c0a4b`
- `vsco2ce/flute-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV/LDFlute_susNV_A4_v1_1.wav — 3460842 bytes — `c8fd15bb561dbdac6d35ffd9c5e49413131d96f8948d5bdf03d4a03fa344c5c0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV/LDFlute_susNV_C4_v1_1.wav — 2722056 bytes — `105a6dbced98de7ae04a317bdd3ba1a5c6b90dc94034439b68cce6635e2781df`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV/LDFlute_susNV_C4_v3_1.wav — 2539512 bytes — `9e09ce606f8fe31c8dd071c717de54d40c38029e3c2e947500defac474e8cd7d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV/LDFlute_susNV_C5_v2_1.wav — 2382720 bytes — `7c9414267bade75f432e38aa893edea9fb7146b5b1b3e0ae1f97a475fa89db0f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Woodwinds/Flute/susNV/LDFlute_susNV_E4_v1_1.wav — 2591256 bytes — `b609d37fb577e2a0f64f20800fba4bed067151375349bf713c0d4e803f862580`
- `vsco2ce/glockenspiel`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_C5.wav — 1271310 bytes — `635f898e0bcb6975b96b18efd9c896f6f1b97ff12174a339ada4814e49675660`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_C6.wav — 1271310 bytes — `e942cbf502cf6731df2925945fe3234c876cb63f047d91007b6929887f9e4904`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_G4.wav — 1271310 bytes — `6c4649b13e24fa01e4634edad8fe8edf18aef33facc5d49fe53097b376bac4da`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Glock/glock_medium_G5.wav — 1226714 bytes — `7045c0ef7260e2f1ad11a64406cf7575ed898d1207a91104d33d78caefac63e4`
- `vsco2ce/harp`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_A2_mf.wav — 2007670 bytes — `1df9f4d138ca3931fcb458bcdf01304cadf2e5f4eef67bbc17b0e42c0e60fce6`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_A4_mf.wav — 2143618 bytes — `3665f3975cad4a33f46784aa4f896f4b4319ba2b7831e892d975bc38c9f09f23`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_B3_mf.wav — 1981130 bytes — `f6f71be8c640822ef48a448b245585659acdfcc7ed5774e10f37be2fc02fcab4`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_C3_mf.wav — 1586172 bytes — `e5d232771704e140959819de8cf2a3e0ba49d021ca77354c42664ce4fce6d9f3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_D4_mf.wav — 1921690 bytes — `ebfde8aab4411019e37e3426f4dd88d6a52a38c2d0261d7f10ec63d8ff584dc7`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_E3_mf.wav — 2461138 bytes — `aafa9d41ec0f77da8f2891055af8b3f9557e0ba1f1df93d53ae6e1fda07afae5`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_F2_mf.wav — 3086590 bytes — `d5c0fb42c176af334fd6f6d1b97858556619c51e177efb5b0c6c23bc19ce6dad`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Harp/KSHarp_F4_mf.wav — 1913498 bytes — `db27ebbb37334c10e06f2ae63f4d9ff555e4d11704fcc6f0bcf503863867e577`
- `vsco2ce/horn-stac`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_A2_v3_rr1.wav — 275300 bytes — `71941b2d1ee773e2330aba86d0dc02985cac76cd3ea59d2f6a083935dc8d8410`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_A2_v3_rr2.wav — 333348 bytes — `b5ad95cae32d0c9a3f30ecc9baafa7de8fe7dd7cb731db0be9873fce45e5b1fe`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_C3_v2_rr1.wav — 116584 bytes — `fdaf3d5ad1e732a6e8e466ee232b101fe83b4cc79e79941315fba3037666eedf`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_C3_v2_rr2.wav — 185020 bytes — `5c030d793aea9e7f07c31b8ed6f9b65ad183bfca87f424bf8c1545843aa734b1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_C3_v3_rr1.wav — 280932 bytes — `7ea5a48590310d32b29aa3046f7ca2708b8f233067352001e6043095d6dac1b6`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_C3_v3_rr2.wav — 293568 bytes — `404a4a516d397bc64f2dd1986dc3efa69ab361763ff814c562ce29e6d64ba3d8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_D4_v2_rr1.wav — 258364 bytes — `06003ac8bfaa154949296447bf6b5cf74df9656137402564ab0717e91bd00714`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_D4_v2_rr2.wav — 299504 bytes — `e96e04228c61ec6895e9b1c3f7c9e742e4e5e4e0a3761ee0d2a8ba09dedab456`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_D4_v3_rr1.wav — 206752 bytes — `14724f3fc89936848381cd8a2399653bacd551364f8118673c0b98ce4d16160f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/stac/MOHorn_stac_D4_v3_rr2.wav — 256428 bytes — `39dd7864c154d126a549eb075e67a8e2b4894bf4341b7593365625f917a627fe`
- `vsco2ce/horn-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_A2_v1_1.wav — 2672192 bytes — `897ffa7cfdf4e0413e4c80e7fa935f28e0a0971691e112f1516c6102da61809f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_A2_v2_1.wav — 2542000 bytes — `8fab29daee8570e8a272b373e7ad906bbe6b4845c1994897e45112e71233c708`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_A2_v3_1.wav — 1305440 bytes — `7ca89d390ac4f9d680d8052a0df0adac9051d844f6fca9154f29cc7aa8b4095a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_C3_v1_1.wav — 2519448 bytes — `d96bc1821e46352e620fc0e3eaa9bbc415824e0f84f19aac6373c54c6aaa34da`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_C3_v2_1.wav — 2240888 bytes — `c0c0b157dcde094c4417b7c165d645897cde9ea6d74247bbab0c0e75355e78c3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_C3_v3_1.wav — 2114316 bytes — `75156ce041d9c60e4de0099b4c6d81cafffd34f45be7bca3e6fa7ebff0eadb80`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/F%20Horn/sus/MOHorn_sus_C3_v4_1.wav — 1761688 bytes — `e8668437838648d4cb6a0fd9e7b207de399bfb87ab1e0e025b5d14e3175aff7d`
- `vsco2ce/marimba`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_B2_loud_01.wav — 1585778 bytes — `a329138008daae1c03652822d7079c0e1e9941071b8c22195e1985f0c685fdeb`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_B4_loud_01.wav — 694454 bytes — `d04aed26222822d14435fa61b88cdcce95606a5e94bb5e7167d266875343a39c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_C4_loud_01.wav — 1016564 bytes — `4af539d47a452d7fad26e171b1c8adcca272cee97191f040d192680462c880b8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_F3_loud_01.wav — 1589876 bytes — `379e749add43b12959fae06cc272f1871899cc05460faf41ead77b93e5d01843`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Marimba/Marimba_hit_Outrigger_G4_loud_01.wav — 800102 bytes — `36f39f9f24789001add2b4c440defb7641178b0e8449c5cb7f1960bccaf0aaaf`
- `vsco2ce/snare`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v1_rr1_Sum.wav — 338762 bytes — `0eb05353ccf93fba34dfcbefa76a30a75b98e6c743a9fd049ad05697c5818ea1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v1_rr2_Sum.wav — 319736 bytes — `8ad82a198e2a535d4170d5f6b684b0e19a55416ffc07d039be89c7a0913f3e0c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v3_rr1_Sum.wav — 457934 bytes — `3df96009d655dd4fe43c635bd3c20314a1e0cbdf9f571ee8a66207f9ef917d08`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v3_rr2_Sum.wav — 346874 bytes — `3ed6158d6873089e0f4967f303c3fab514ddde3991117a45d259d419f6bc62b8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v5_rr1_Sum.wav — 360722 bytes — `8deb654b739f6dfb01f192b7043a9aad92b7973995246252571240fe712d0876`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v5_rr2_Sum.wav — 383162 bytes — `1f7ca9367273f7958cfccd5e454c0f30bb471301bc9ee05ef753c6f0423a3798`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v7_rr1_Sum.wav — 407198 bytes — `436c4b37fdaf92da481d59befd7e54ed4d1c6fdac0cbeadd657e6f5aec0315ab`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v7_rr2_Sum.wav — 387608 bytes — `e2a598d82b22e961a6c59fe4dd63e6dd717df394398e5e9fbe7b473b83d1e10e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Snare2-HitSN_v9_rr1_Sum.wav — 442280 bytes — `af1e5609991b5a840c3b9affefa2c65fae98df518de770c05a1eec73dab118e1`
- `vsco2ce/timpani`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani1_Hit_v1_rr1_Sum.wav — 559976 bytes — `a43d60795e9eab808866c22b6b6b42a64d3a13f6754838f0100a0a1e9a3029cd`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani1_Hit_v1_rr2_Sum.wav — 542456 bytes — `8f0e0367321f1bfae71f2ef776957ea625d0a48d618fee6f9d42a160222e59c5`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani1_Hit_v3_rr1_Sum.wav — 1602676 bytes — `8b39a785901d08dee14dd89914bdf2201e16ee418965e4d903fdb8e280a14d24`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani1_Hit_v3_rr2_Sum.wav — 2026620 bytes — `ac6ae66048e162024d188f1ea01f6b8b6bd9184d35e164258bab6a383eb7ff93`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v1_rr1_Sum.wav — 1150296 bytes — `19b6e335811edd38d7ecc180d9d6e4adada12ff7a882f83e5153f093a912ae85`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v1_rr2_Sum.wav — 1325164 bytes — `702eb08bffe0a8029c2454c7fac6d35a9371d1c9af29e90f38cc00e472a0cfd2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v3_rr1_Sum.wav — 1895164 bytes — `69e5d604effd3f29c86117d22ad2335f73e43f5d47868dc57d8fa593975ee241`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v3_rr2_Sum.wav — 1816436 bytes — `828019517a0475cb9b42d1e40e2cb0a62159f3a9de1d67a5c238f3687e41761e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v4_rr1_Sum.wav — 1638140 bytes — `b737b4bde0c2f54f57866ea7cdce79bc2e67162e37906a6820614fbc57324940`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani2_Hit_v4_rr2_Sum.wav — 1805072 bytes — `d2a6e02a97f484147ab52e779477398e9a91a408fe455df7ff203996dd3adc81`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v1_rr1_Sum.wav — 929172 bytes — `00319863ade67b49ec64566eecc801ac7c95e101860b7bb3263f25c7d6757392`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v1_rr2_Sum.wav — 1434376 bytes — `cee412e52e189f4b893431a3efc6737b8221efd3c113a4ea9aaeeed57721be23`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v3_rr1_Sum.wav — 1608252 bytes — `46cd2ba3798f9e3a6be515b13dbc37d2ef65c82afb0d0e9e34121e4524bfcd3a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v3_rr2_Sum.wav — 1474164 bytes — `8eb961265ed1e07249dd2fc164f20b82f3e544c3e19ab3c9efef43a51e1c9575`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v4_rr1_Sum.wav — 1813928 bytes — `59a58eb828dc109e3cc7b7744a0f84e47182cadf2cf548a0c0b94ae5581cdc60`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani3_Hit_v4_rr2_Sum.wav — 1844480 bytes — `cd85951fa4e74ce9128bc10c58365538b041d71dd28de21ac21048ab7a8f37dd`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v1_rr1_Sum.wav — 1183312 bytes — `0c2929ae4fa59e0cbd2a43ee1abb187cce99dc41713bcb012ea71eac39fe6c35`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v1_rr2_Sum.wav — 751128 bytes — `a9e2679b5fad104b051375c877977a28a75cf1cb04337186c204c8baffc39a11`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v3_rr1_Sum.wav — 1012976 bytes — `05170757d30297aa680bfbc082c6e438deb1d1d72c5e757610d0b1bbd525968f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v3_rr2_Sum.wav — 1278328 bytes — `ff4a34bdf6c98489dbe496c92671020bac7b3e92331f310fc8542085fb75d014`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v4_rr1_Sum.wav — 1599356 bytes — `71161169062458913095b6d87d0eacb1bc344622e28832fef9458c7f142c8860`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani4_Hit_v4_rr2_Sum.wav — 1765536 bytes — `fa78ee249f1011bf5a66522bfa8387eb0cc952a637701fc924ed98e0a9b51600`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v1_rr1_Sum.wav — 327568 bytes — `c6fc35883ec63df83250b9eb92b05763504a3a484fffad5e82eb95945cab32cf`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v1_rr2_Sum.wav — 262192 bytes — `612b09a6c13aaa3e32ce4849564c150001c859a6fad0e1c90e0df79d7509cca1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v3_rr1_Sum.wav — 1036528 bytes — `da8212316bb05e3c06c730d6a67ae4b3c8ed90ca5ec8c52410cb9d0cde1bddb4`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v3_rr2_Sum.wav — 986304 bytes — `e1195b473349412495d9c398840dc19b3fb1bf7530b4b85ab78a6d448caa9c40`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v4_rr1_Sum.wav — 1213880 bytes — `520bcf3b2f5d974076d0eb0eb3ba5201de0be5098860e9d752c6deaa295ae3ba`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Timpani5_Hit_v4_rr2_Sum.wav — 1141072 bytes — `1f34a78ec7d5ce9f1a5ded7ccffd04da806507f43503b6ba9f380d315623a6ce`
- `vsco2ce/timpani-roll`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani1_Roll_v3_rr1_Sum.wav — 5196524 bytes — `834f3fcf28a546d854cf3e331cde3d14da68788d130ca306a2ef6f975230566a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani1_Roll_v5_rr1_Sum.wav — 4263936 bytes — `9a4b61ae283d607cc77f07d99908f5f1835c4512fdfaa2a69b8b878f51a0ae60`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani2_Roll_v3_rr1_Sum.wav — 4404508 bytes — `3f78dc5077ed03ea6bc1c125e27be8882b8260ba37ec379da06b80334c7661e7`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani2_Roll_v5_rr1_Sum.wav — 4587896 bytes — `f05404c85a8512f2a1503b849ed54b5c1a0e7ea7fab93f68dc2817819a137f44`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani3_Roll_v3_rr1_Sum.wav — 4340208 bytes — `5d41045533f0163be7ca264cf9c18b3a4e898ecba334c49c0786f14d04665d3a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani3_Roll_v5_rr1_Sum.wav — 3662952 bytes — `423a57aaab07fe6e406a7e066ba78ab7c5196b3c62067e58a5718a780d22264c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani4_Roll_v3_rr1_Sum.wav — 3064788 bytes — `c9ce7599c5f5612a66d01a3830a3ec92311cca4985ca6764c4b2b70b6a89e535`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani4_Roll_v5_rr1_Sum.wav — 3570220 bytes — `1e3c6c8231c668e103fd801845c10d5fc7af2a3757110595724b37cd4a9832bd`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani5_Roll_v3_rr1_Sum.wav — 3143844 bytes — `1b18f7b552be1f9e099abc9ae14724adebd200dec96f46ae12223cd9fdd3f120`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Timpani/Rolls/Timpani5_Roll_v4_rr1_Sum.wav — 2967320 bytes — `794123bbe4625ab4abc4fb31de27dcfc4276de7cc4fc2df5e50271e27e5c5d0e`
- `vsco2ce/trombone-stac`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%231_v3_rr1.wav — 274064 bytes — `c71af28710d365bbfb7e6a02df01c8cc6fd966e85bc3e9122c8cd5e9d3314ae9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%231_v3_rr2.wav — 215868 bytes — `91e40a027a74a9b7b05a6c1a8215917f06fc21827a3de6634954131628c40e38`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%231_v4_rr1.wav — 230512 bytes — `5f825bebf5638d1216e50bcad6a265628fc8472e10c52808319a6d0544f75ea5`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%231_v4_rr2.wav — 248472 bytes — `a800bb69d69bd557cf30962652b333d49c4496aeba621a3fc3762836d908edf9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%232_v4_r2.wav — 276676 bytes — `265f2a57eaad42a972d775d4b5f12917a2e4eb91b0abc442326f074482444389`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_A%232_v4_rr1.wav — 358016 bytes — `27829f7d7a636ef38df6129a83f3eff92f3a5058297a1a49d028464dc2f9d0bb`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_F2_v3_rr1.wav — 177232 bytes — `ecae67d794c2d0f3494e6613ce49c4c53c25eeda5fb95beb75a00237c0471908`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_F2_v3_rr2.wav — 175100 bytes — `a8656a33b541010729190e0c65503cafb52506c97ec4f25768e4525cb4e5028b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_F2_v4_rr1.wav — 270120 bytes — `378b9f790ef731c18f9c8468faf973b0e848b8ff797795681d20812abbb25674`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/stac/tenortbn_stac_F2_v4_rr2.wav — 256564 bytes — `8477fa7bfa3ed4c6f0cf656a10b52813b98fca6d77151c2cee9150a446b0fae5`
- `vsco2ce/trombone-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v2_1.wav — 1658240 bytes — `09d6fff28ec8d8a3ac83505c61cf4e2e95fce5b232f3ae4f7adfefddb7af56e1`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_A%231_v3_1.wav — 930872 bytes — `9385dcf9b1a1b32db2d29b696d051fe8fe00aac9bfbd81270ff3570c57970d39`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_C3_v2_1.wav — 1612016 bytes — `6858987188e6e87a24ea6b37d0f3c07921e8f891adafbdbd2c72bb8f7241e8ab`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_C3_v3_1.wav — 1351140 bytes — `ba3760e74edf6c25f96a0deb526bf87eba2bf74be94ba76bf31d0d6592efe687`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_D2_v2_1.wav — 1733144 bytes — `f71a6d3914ac0daa656553cbd2b50af560897fd31920fb578ac85313d2787b36`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_D2_v3_1.wav — 1162132 bytes — `aad670ae4e1c97487c000c7e8b47f90486d1b835e6244de4ddad18e06b70465b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_F2_v2_1.wav — 1752628 bytes — `9d4d0eeef23a823416724e150deebb141f85d5ff1a90226e947bc4ba13c00597`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tenor%20Trombone/sus/tenortbn_sus_F2_v3_1.wav — 1107668 bytes — `675abd9954c0bb01bd6049cb7f5dcf908f627c673668ac9393226a09ba0fad2a`
- `vsco2ce/tuba-stac`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_A%230_v2_rr1_Sum.wav — 152280 bytes — `8ffdd2adcb4f77136461d437feda1f093920307fc83ea290c14b3664e0a5064b`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_A%230_v2_rr2_Sum.wav — 134768 bytes — `011b97d0fc8031334a36d86782084748792d895365015736130bfb417c61cc78`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_A%230_v2_rr3_Sum.wav — 138668 bytes — `7bdc61bb96ee6881d14abe5b59ed418b811d736de5c4b27565cae7527096a012`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_A%230_v2_rr4_Sum.wav — 130636 bytes — `712b001e5152f312f817f2e96102fc3ddd647e9a60ac516341c5ea2d771decab`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_D%231_v2_rr1_Sum.wav — 227256 bytes — `62450773c01a68affba727ae23539e09d43e760a2ecdf7192ba2dd2c3daae636`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_D%231_v2_rr2_Sum.wav — 166056 bytes — `6e4a95791ac5af718924d5b50f6d8462b072a5557a25d4038721b7baa8095c55`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_D%231_v2_rr3_Sum.wav — 173064 bytes — `e8c4f85e4962f639886bfbc5f2ae18f3c492c783d6c941fadee6dd1d9228c9c4`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_D%231_v2_rr4_Sum.wav — 158208 bytes — `d9019237ca2cffcc57483c601c5ce85d1869643ec9fe9a5979bde72827fe43c2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Brass/Tuba/stac/Tuba3_stac_D2_v2_rr1_Sum.wav — 125584 bytes — `4ed9b5455e0c8b2532e9cac41e32a9218e96a4260a0104008b0a86083d3b7ce2`
- `vsco2ce/violas-spic`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_A3_v2_rr1.wav — 213020 bytes — `f6baadc442ac3ae31076ff746ed2415f347e7260600ef05069ce7894cb147884`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_B2_v2_rr1.wav — 381464 bytes — `1d9b8a9047d11b06750c24bb783c8925ac300135235a94ce64c6c78934eb712f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_B2_v2_rr2.wav — 348488 bytes — `e69d80890f3b724b0981a80bd55a3f3b2811c7164b78479905481a07dfe61d07`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_D3_v2_rr1.wav — 229276 bytes — `7eab07c87ffc99ffed8ce111ff297e6bde95350136cf93db706d4f658c96570c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_D3_v2_rr2.wav — 272300 bytes — `c500f1199fb2182adab4a7d67a0a687b02f0748736f0df973fbf4b7b93d801da`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_G2_v2_rr1.wav — 211020 bytes — `ebd5f73e697f3d68e263429c9ca62337bb20982316b959487c4f4c9efa44a5cf`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/spic/Violas_spic_G2_v2_rr2.wav — 248216 bytes — `c07030e1279a1d9affd9718491f280dc7b5d81a5022577e87080b8b659393e79`
- `vsco2ce/violas-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_B2_v1_1.wav — 2861510 bytes — `ad96d747c5125adec8f069c49091ee3ba937efd4a5b909d3c4938f17e3c8513d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_B2_v2_1.wav — 3268364 bytes — `edc77038a83f47cf49296c0009fdac23cb5ade3133a2beabd0d2d1f591ccf3cb`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_D3_v1_1.wav — 2789648 bytes — `61ab4cfc0ea90c683433a7c50b3bb4fa86a81c9d4854589562707d54ed028349`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_D3_v2_1.wav — 3596756 bytes — `f941028c5d5e854b4391669056f0f639799f80ac7c8da3939c7788b1a394d16c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_F3_v1_1.wav — 2487818 bytes — `7a37f00ecb58fcaa5c32427a5ffb30950787b40c247409a8e18cfe0880955fd8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Viola%20Section/susvib/ViolaEns_susvib_F3_v2_1.wav — 3471944 bytes — `d281171e60b852451deecce57a6f5e9b623eea9632916336324c52c4ada6c750`
- `vsco2ce/violins-pizz`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_A3_v1_rr1.wav — 163490 bytes — `6807c9f8a2b8851e866e1f9bb92e9809982693e3593882673d0fe6dedf9b7a96`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_A3_v1_rr2.wav — 180382 bytes — `aa4d92ddd001ca80737ffcd3aa6a10f6e1b27192bb47a184c05f183475343385`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_A3_v2_rr1.wav — 194010 bytes — `631720219cbd7b11718b393bdacf04eb512ef5071f9e5d0d73d74b3f17179ec2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_A3_v2_rr2.wav — 205482 bytes — `aa6e4d7c84536837e6b9b19203b701a83263b2f4005fc44bd0959321e80c91a5`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_C4_v1_rr1.wav — 105914 bytes — `7002bd5b93f26bb773ff77e349fbb3b5aa059404889706ddda9673da7488886c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_C4_v1_rr2.wav — 122922 bytes — `738c073c13a365f5dcc75f07ef5c540eb15c228e493dc406b9467168af894421`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_C4_v2_rr1.wav — 184590 bytes — `909eb79fc2c9076909680fa3c2dabdbbd15870f674a883ddab33bbcd0dac965a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_C4_v2_rr2.wav — 197238 bytes — `f7ca78a98e4d7dae1ad0a1e1d7f20d9696aedb22751748a3b28f5c4ec2df7de2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_F%233_v1_rr1.wav — 197422 bytes — `a4b60e0fe3090df0282dfd78eb74ac0a4977d8029ed69dd1d67d736e76d33362`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_F%233_v1_rr2.wav — 135562 bytes — `bfbdce2c919c8959ec11b49224736af943253b31427577ff6e073f0a20f90b74`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_F%233_v2_rr1.wav — 157066 bytes — `2c6093daad3f6f7a977ac9775660b57227429651d35d489d6f98e617067e8ea6`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Pizz/VlnEns_Pizz_F%233_v2_rr2.wav — 176738 bytes — `fef269022693eef0b318c1db1a03658f1063ee4d7e3b3bb25e29add97bad6cdc`
- `vsco2ce/violins-spic`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_A3_v2_rr1.wav — 213126 bytes — `ce5d025e7c2ac71e220a3f6487c5a2ce431a150e808c93276570f19536568a5e`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_B4_v2_rr1.wav — 199926 bytes — `d1495f4eaff7b3e4bd8d86b886dc81ccb52b113fb93630e8f68792ed452dc822`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_B4_v2_rr2.wav — 168810 bytes — `94f256b01d2c37eb429336d32385d8b05072e4e896f387731178d2a33a7a9b78`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_C4_v1_rr1.wav — 130390 bytes — `b734950875dff1dd7cda7c4721901516560b99f5655c3ffd40b6dc43c16e9c2f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_C4_v1_rr2.wav — 110434 bytes — `ba73270a400a25b78ff59b5ad15cd9ba1dc2b010f32ef8913a223518bc327cc0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_C4_v2_rr1.wav — 167454 bytes — `a14e9795677e0c418f1e18f7b640bc27b8cb3aef4cfef766e18caf38549ffe56`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_C4_v2_rr2.wav — 124626 bytes — `a6dbe1a0118aceb93665afb4d8bf1fab249d0842c75801745bf9d3526bddcf73`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_E4_v1_rr1.wav — 87666 bytes — `67314bb58fcf351654874664f253257c66d5d4e0ef5a3f36d7249c472faf85d3`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_E4_v1_rr2.wav — 183402 bytes — `28ddf685682bda79004708c2edf7d60df4a9830b2962e2356b6f6e2efec53b38`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_E4_v2_rr1.wav — 106314 bytes — `db063e7e21abb2d3271d0e96068601fbb48a91f2f0bfde8dea773ce1a6bacfb0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_E4_v2_rr2.wav — 134190 bytes — `4acf30d89e77aedaa2c69d0ae8a475abe98539134c8b72985f860658daa8630d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_G4_v1_rr1.wav — 193166 bytes — `ae748a8421f32e0e490fbf298b6bc32ec5534c2210ba2d6d9f65fd77726e1107`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_G4_v1_rr2.wav — 221382 bytes — `17fed4ff1985b556e9153fe0b00c6e8650b84f7249ff720d58dc1aa770212dde`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_G4_v2_rr1.wav — 162898 bytes — `3345451be62b9bdfbbf6bb03f22f410484abb75585992336d530215fc4df7141`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Spic/VlnEns_Spic_G4_v2_rr2.wav — 154078 bytes — `f41d60066c6d0fa7d21308e97f237a34d6ac2765e477cc330ffb7e8821e4cc3c`
- `vsco2ce/violins-sus`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v1.wav — 1890316 bytes — `72817a53dfd2eb61eca94658c14e1cab6017629ca2f27bab8e394c6675bfaad7`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_A3_v2.wav — 1671704 bytes — `3fc4a9e22037643fce11e755da72c61c664893f83e637c24a7b5c2d3824ab986`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_B4_v1.wav — 2056964 bytes — `ec4cea41ac77f251bf5f4158fe9cbeeae13755e3785106e505808de18fdddc0d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_B4_v2.wav — 1923744 bytes — `bdb85532f47e4ebd681f9617a415116e7e5aeb786dce2eeab5ab9b93c1b31644`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_C4_v1.wav — 2063320 bytes — `c07edd5b2119fa1da2207aba996961b50dd616f69bbcf2300ab271bc6c16239f`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_C4_v2.wav — 2017512 bytes — `5857387b40c412f756ef281c1171247664432a4e5078c98142d595d15cd92ef9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_D3_v1.wav — 2061808 bytes — `583e660bc5daa4e094aef5fc014fbb92751040be8741ed7a16847306a1fe0a99`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_D3_v2.wav — 2457908 bytes — `77893dbf1ea1be8c40ad756d16b916298e6b1b0742495e9853e020375592357c`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_E4_v1.wav — 2315540 bytes — `787fb4bcfb47d5c88ee1573c8db15f32d345386301be4a8eea6a825847413ae2`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_E4_v2.wav — 1702620 bytes — `030c09a631ebbc7304fc0b47bb5c346cd646e7451d9fdc531870f2534c60d9e9`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_F%233_v1.wav — 1585612 bytes — `8dc13d197373f0d1fe1b0744de57796800bde372906d3667398c55d473a383ea`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_F%233_v2.wav — 1720800 bytes — `d7bc6b4c259b9543de4fe66228ee107205b8f539c8d7c1de71f5781d45a14fc7`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_G4_v1.wav — 2330236 bytes — `ed2a89cf254432d2af073699fa43ebfa16cfbc5552c7fc964a184fc434eaaa39`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/susVib/VlnEns_susVib_G4_v2.wav — 2150136 bytes — `a1d6d5a0397541692e2f88a0cd9820eabe90407784ee631aa3bfa74772637a65`
- `vsco2ce/violins-trem`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_C4_v1.wav — 1633776 bytes — `5131207ccce04e0e0869efdac89bf2caa33a19aa75c40f51e4a91a67849afaa5`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_C4_v2.wav — 1432052 bytes — `fb63b02651cf1f08c103f192e6c4783a6c469c4ed953d069949e9b0fe92bd9f0`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_E4_v1.wav — 1555896 bytes — `9cccda56045581dce0f325cb62379d088b210eebe6ae252f72634caada264062`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_E4_v2.wav — 1400056 bytes — `4b0e7479cd0029c93046e90abd687ff8073ecab5d4af91430ac67fab5ef7056a`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_G4_v1.wav — 1717532 bytes — `a3196a9c61fcb5d1460641d7410a977cafb679a6b07b600b0d5779f05683d216`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Strings/Violin%20Section/Trem/VlnEns_Trem_G4_v2.wav — 1487868 bytes — `e20f6d61f4d4db7637d25f7aebab6873eb5083b9c5f4d1e10b946552110fb05d`
- `vsco2ce/xylophone`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo/Xylo_Medium_C4_ff_01_far.wav — 897126 bytes — `ef8650516f0734369c5f409f726315db13544e508f59cb82cf46f4206c10518d`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo/Xylo_Medium_C5_ff_01_far.wav — 504372 bytes — `b2ceeb64877d9975afbdf2fafb8892c416ac760c63bb2bc544007ef2331d35fd`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo/Xylo_Medium_G4_ff_01_far.wav — 669186 bytes — `f7e72d629db9b1f7d37b050cc1abf18bbde9629d616c91647d7abe5d7fb249b8`
  - https://github.com/sgossner/VSCO-2-CE/raw/440300901dfe9275fd84e0b7763af1f8443ae62e/Percussion/Xylo/Xylo_Medium_G5_ff_01_far.wav — 432828 bytes — `d5b45edd0c164356c0425b663b9307bbb77a647ba7554423c6a8aa455ac8b2b3`

## WP-P0-12

### Made for this project

All icons in `assets/icons/` are `LicenseRef-Original`: rendered by `tools/blender/icons/build.sh` from procedural
geometry (`containers.py`, `dishes.py`, `props.py`), procedural shaders (`shading.py`) and label art drawn for this
game from vector shapes by `labels.mjs`. The labels carry no lettering, no brand and no generated imagery; the image
generation tool made nothing here.

### Reused locked sources (WP-P0-05)

| Asset | Provider | Author(s) | License | Used for |
| --- | --- | --- | --- | --- |
| [Studio Small 09](https://polyhaven.com/a/studio_small_09) (`polyhaven/studio_small_09@2k`) | Poly Haven | Sergej Majboroda | [CC0-1.0](https://polyhaven.com/license) | icon rig studio world: reflections in every icon |
| [Metal 009](https://ambientcg.com/view?id=Metal009) (`ambientcg/Metal009@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | `icons/2115` tin seams, lid and pull ring, through `materials/metal_brushed` |

## WP-P0-05b

### Assets

| Asset | Provider | Author(s) | License | Made by | Used for |
| --- | --- | --- | --- | --- | --- |
| [Paper 001](https://ambientcg.com/view?id=Paper001) (`ambientcg/Paper001@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photo with approximated PBR maps | newsprint |
| [Plastic 001](https://ambientcg.com/view?id=Plastic001) (`ambientcg/Plastic001@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photo with approximated PBR maps | plastic |
| [Wicker 013](https://ambientcg.com/view?id=Wicker013) (`ambientcg/Wicker013@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photogrammetry scan | rattan |
| [Bark Brown 01](https://polyhaven.com/a/bark_brown_01) (`polyhaven/bark_brown_01@2k`) | Poly Haven | Rob Tuytel | [CC0-1.0](https://polyhaven.com/license) | Photoscan | bark |
| [Brown Mud](https://polyhaven.com/a/brown_mud) (`polyhaven/brown_mud@2k`) | Poly Haven | Rob Tuytel | [CC0-1.0](https://polyhaven.com/license) | Photoscan | soil |

### Downloads (URL and SHA-256)

- `ambientcg/Paper001@2K-PNG`
  - https://ambientcg.com/get?file=Paper001_2K-PNG.zip — 36574990 bytes — `940818545128b01004af9a8d2a0a8c0476546d3f904d5b1c6f01cbc265295286`
- `ambientcg/Plastic001@2K-PNG`
  - https://ambientcg.com/get?file=Plastic001_2K-PNG.zip — 56274869 bytes — `8e015907f4141076b9a28315abc1ec80f0f43de7f771c345e27b6c4faedaf029`
- `ambientcg/Wicker013@2K-PNG`
  - https://ambientcg.com/get?file=Wicker013_2K-PNG.zip — 60071432 bytes — `9c3b462b2a55e290c6710cd9fd047976fa93c8a8f1a26eb53e72c239112f8c21`
- `polyhaven/bark_brown_01@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/bark_brown_01/bark_brown_01_diff_2k.png — 8393792 bytes — `617985520504f73226bb54d7f64891687c8073b6efd30348008c7a1d241e04ca`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/bark_brown_01/bark_brown_01_nor_gl_2k.png — 8953179 bytes — `c5d2c162ee3e30a36dfb717fde6703e0202ab9c49fbfe205da521a48d7a5a595`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/bark_brown_01/bark_brown_01_rough_2k.png — 7228983 bytes — `d7990a8319db5beb185d6fd36b1d9acef82556e2d942d68583ce3a505907cab2`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/bark_brown_01/bark_brown_01_ao_2k.png — 4022617 bytes — `02bb9025280895c00e4d93a7849bff005295207dbed1e398962b0e2a64750286`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/bark_brown_01/bark_brown_01_disp_2k.png — 7074420 bytes — `7d2c56b93806701c4260e8d353949d01010301a6daa6e465d5e5e1a18d4b1465`
- `polyhaven/brown_mud@2k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/brown_mud/brown_mud_diff_2k.png — 7393206 bytes — `4709452f41154926d6d6355207044fb13b8bedc2b234f2870bb3e0d5bd5a026d`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/brown_mud/brown_mud_nor_gl_2k.png — 8710573 bytes — `06f04240c8aad947bb37acd118763e92736f57c8edaf27e95fe8185d32bbbabd`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/brown_mud/brown_mud_rough_2k.png — 2428191 bytes — `7b3586a50c725b5231004da7784248f8768b00b407e104203921ed35b6d3c75a`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/brown_mud/brown_mud_ao_2k.png — 3458008 bytes — `59911c0f15b2bbd040830d2c25c12e6b8a5c894ffbaea6a8ac134c4065ea954d`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/2k/brown_mud/brown_mud_disp_2k.png — 2002655 bytes — `c75285ef351f683c35f419c3ed9fe5460f71f01719935baafc877ddac2ac9b93`

## WP-P0-09

### Assets

| Asset | Provider | Author(s) | License | Used for |
| --- | --- | --- | --- | --- |
| [Subject 115 (bending over), trial 6: picking box up, bending knees](http://mocap.cs.cmu.edu/search.php?subjectnumber=115) (`cmu/115`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | pickup clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 13 (various everyday behaviors), trial 4: sit on stepstool, chin in hand](http://mocap.cs.cmu.edu/search.php?subjectnumber=13) (`cmu/13`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | sit clip: the seated part, hands in the lap (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 140 (getting up from ground), trial 8: get up from ground laying on back](http://mocap.cs.cmu.edu/search.php?subjectnumber=140) (`cmu/140`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | sleep clip: the pose lying on the back before getting up (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 16 (run, jump, walk), trial 46: run/jog](http://mocap.cs.cmu.edu/search.php?subjectnumber=16) (`cmu/16`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | run clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 35 (walk, run), trial 1: walk](http://mocap.cs.cmu.edu/search.php?subjectnumber=35) (`cmu/35`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | walk clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 79 (actor everyday activities), trials 1, 14, 15, 26: chopping wood; making dough; eating a sandwich; planting a tree](http://mocap.cs.cmu.edu/search.php?subjectnumber=79) (`cmu/79`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | attack clip: chopping wood; use clip: making dough; eat clip: eating a sandwich; work clip: planting a tree (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 82 (jumping, pushing, emotional walks), trial 8: stand still; casual walk forward](http://mocap.cs.cmu.edu/search.php?subjectnumber=82) (`cmu/82`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | idle clip: the stand-still part; hit clip: its base pose under the procedural flinch (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Subject 90 (cartwheels; acrobatics; dances), trial 18: rug pull fall](http://mocap.cs.cmu.edu/search.php?subjectnumber=90) (`cmu/90`) | CMU Graphics Lab Motion Capture Database | Carnegie Mellon University Graphics Lab | [LicenseRef-CMU-Mocap](http://mocap.cs.cmu.edu/faqs.php) | death clip (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [MakeHuman system assets](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html) (`makehuman/makehuman_system_assets`) | MakeHuman Community asset packs (MPFB system assets) | MakeHuman team (system assets) | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | male_casualsuit02 (crew top recoloured as the hoodie, the pack's jeans), shoes06 (recoloured dark, white soles), short04 hair, eyebrow001, eyelashes01, low-poly eyes, brown eye material, young_asian_male skin (characters/wage); male_casualsuit02 (a dusty-rose hoodie, the pack's jeans), shoes06 (recoloured pale), ponytail01 hair, eyebrow010, eyelashes02, young_asian_female skin (characters/college); male_casualsuit05 (the jacket's body as an orange hi-vis vest, its sleeves navy, the pack's shirt, the jeans as khaki work trousers), shoes06 (recoloured brown), short02 hair (greyed), eyebrow005, middleage_asian_male skin (characters/manager); male_casualsuit03 (the striped shirt, the jeans as grey office trousers), shoes06 (black), short01 hair, middleage_caucasian_male skin tinted grey-green (characters/zombie_a); male_worksuit01 overalls, shoes06, short03 hair, eyebrow008, middleage_african_male skin tinted (characters/zombie_b); male_casualsuit06 T-shirt and jeans, shoes06, short04 hair, middleage_caucasian_male skin tinted (characters/zombie_big); all faded, dirtied, bloodied and torn in the bake |
| [Skins 02 (natural male skins)](https://static.makehumancommunity.org/assets/assetpacks/skins02.html) (`makehuman/skins02`) | MakeHuman Community asset packs (MPFB system assets) | Mindfront | [CC0-1.0](https://creativecommons.org/publicdomain/zero/1.0/) | mindfront_aksel_skin normal and specular maps: skin pore/wrinkle normal and roughness (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [MPFB 2.0.17](https://extensions.blender.org/add-ons/mpfb/) (`mpfb/2.0.17`) | MPFB (MakeHuman Plugin For Blender), Blender Extensions | Joel Palmius, MakeHuman team | [CC0-1.0](https://github.com/makehumancommunity/mpfb2/blob/master/LICENSE.md) | base mesh hm08, macro targets (phenotype), game_engine rig and skin weights, clothes fitting (characters/wage, college, manager, zombie_a, zombie_b, zombie_big) |
| [Jogging Melange](https://polyhaven.com/a/jogging_melange) (`polyhaven/jogging_melange@1k`) | Poly Haven | colormass, Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | hoodie and hood: heathered jersey variation, normal and roughness (characters/wage, college); the backpack (characters/college) and the hi-vis vest (characters/manager), at lower contrast |

Motion capture: the data used in this project was obtained from mocap.cs.cmu.edu. The database was created with
funding from NSF EIA-0196217.

Made here (LicenseRef-Original, inputs above): the hood and drawstrings (generated on the top by
`tools/blender/characters/character.py`), the College Student's backpack and straps (generated the same way), the
hi-vis vest's bands, the zombies' dirt, blood and tears (baked from procedural noise), the garment recolouring and
the baked texture atlases, the
retargeting, loops, foot locking and root-motion extraction of the clips, and the procedural layers on two
of them (the hit clip's backward flinch, the sleep clip's breathing).

### Tools (build time only, not shipped)

| Tool | Author(s) | License | Used for |
| --- | --- | --- | --- |
| MPFB 2.0.17 add-on code | Joel Palmius, MakeHuman team | GPL-3.0-or-later | builds the human in headless Blender |
| Blender 5.2.2 LTS | Blender Foundation | GPL-3.0-or-later | modelling, baking (Cycles), glTF export, renders |
| KTX-Software 4.4.2 (`ktx create`) via WP-P0-05's `tools/bin/install-ktx.sh` | The Khronos Group | Apache-2.0 | KTX2 (Basis Universal) textures |
| glTF-Transform 4.5.0 (core, extensions, functions) | Don McCurdy | MIT | meshopt compression, texture swap, validation |
| meshoptimizer 1.2.0 | Arseny Kapoulkine | MIT | EXT_meshopt_compression encoder / decoder |
| three.js 0.186.0 (GLTFLoader, meshopt decoder) | three.js authors | MIT | loads the character in tests/characters.test.js |

### Downloads (URL and SHA-256)

- `cmu/115`
  - http://mocap.cs.cmu.edu/subjects/115/115.asf — 7267 bytes — `26c627af258f337930ec3c84bb75d3a727425e27083208b79107e10be16a9017`
  - http://mocap.cs.cmu.edu/subjects/115/115_06.amc — 286590 bytes — `66d3a9e9a8eaed036ddc155dd335014a38c533924481b8075e1d5947c89a24c1`
- `cmu/13`
  - http://mocap.cs.cmu.edu/subjects/13/13.asf — 7264 bytes — `eb33390bcbccb739d7622bd583fd9be55020868f68689aa6f2060ad688df10dc`
  - http://mocap.cs.cmu.edu/subjects/13/13_04.amc — 3813315 bytes — `bc5f5e5b6378413457f782e96c2beedf70c5abc6bdcabca513f8f5b0d966d7e9`
- `cmu/140`
  - http://mocap.cs.cmu.edu/subjects/140/140.asf — 7259 bytes — `13d3c7488671d3902c0ea7faa672e1c79465c034c050de88668ace164e519a37`
  - http://mocap.cs.cmu.edu/subjects/140/140_08.amc — 713953 bytes — `afaafee69db963a51059e324355d089e95d48f71117cd44e4304d68bf1a4dbf8`
- `cmu/16`
  - http://mocap.cs.cmu.edu/subjects/16/16.asf — 7257 bytes — `2323f876564610f84bfbec9b90b8ebffb57515673b7f4a45b0fb0849af465bdb`
  - http://mocap.cs.cmu.edu/subjects/16/16_46.amc — 108057 bytes — `0323c44d6e0772ff241b554a9f5aa4fe0246935e835e375715936e28bdd44aae`
- `cmu/35`
  - http://mocap.cs.cmu.edu/subjects/35/35.asf — 7261 bytes — `2a8e2eda3c0d7d828566b2a9a8ab36b2b8b3864110574e8b73c8f069fded416c`
  - http://mocap.cs.cmu.edu/subjects/35/35_01.amc — 286988 bytes — `0743f4ea48e7e199cd56b2810b5ce81f8ede08d32ff79aa4e363c44cc4fe33aa`
- `cmu/79`
  - http://mocap.cs.cmu.edu/subjects/79/79.asf — 7257 bytes — `aa7fb254b0e7b9155df59e0f0cf76cbe34c476c6f4b3f015e63d5ae170d2fe2d`
  - http://mocap.cs.cmu.edu/subjects/79/79_01.amc — 469052 bytes — `19589cdea91d7eb41caf7445a31d06a8a1ea7953f561f984fff15a361672c30e`
  - http://mocap.cs.cmu.edu/subjects/79/79_14.amc — 553468 bytes — `e0ba78f52efa8399dfc6f8cce86457f3a3cfcae3fe45212752da082b6078edb0`
  - http://mocap.cs.cmu.edu/subjects/79/79_15.amc — 663149 bytes — `d64fd297ec1a2ad577c271fb2af4061d92c6cbde782cd9f86c3c22a2aba759aa`
  - http://mocap.cs.cmu.edu/subjects/79/79_26.amc — 781416 bytes — `522a51fbfbd583abbdee3ca1dd1191a510ed65d68b0b9c9a6e8e87b223c5ea7c`
- `cmu/82`
  - http://mocap.cs.cmu.edu/subjects/82/82.asf — 7257 bytes — `32f0f3a53099526ed4df3ef443d4ba65419e4952ab3fd6bdf89d901addda4a1f`
  - http://mocap.cs.cmu.edu/subjects/82/82_08.amc — 1355543 bytes — `aed403d138c0ad332fd72b85f591aa407ecc317b592bbb5583f9cc0138a5b019`
- `cmu/90`
  - http://mocap.cs.cmu.edu/subjects/90/90.asf — 7263 bytes — `2b8d402ef539db75263ab7c7697bc387777fa037ac55ee85a7b734960c965384`
  - http://mocap.cs.cmu.edu/subjects/90/90_18.amc — 316443 bytes — `bf64f9f278fdc6a61a703bed5227498c45de021ab7f67a16d81e5f45df134f48`
- `makehuman/makehuman_system_assets`
  - https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip — 280737770 bytes — `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`
- `makehuman/skins02`
  - https://files.makehumancommunity.org/asset_packs/skins02/skins02_cc0.zip — 76112708 bytes — `1613f1ef3afca53094511d26620ed7cf1d2dedc29ed3d384d60bdebe250698ae`
- `mpfb/2.0.17`
  - https://extensions.blender.org/download/sha256:4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87/add-on-mpfb-v2.0.17.zip — 45031536 bytes — `4f0a879d64a39bf646fbf5f53601ac678855da329d650617dca5737548239a87`
- `polyhaven/jogging_melange@1k`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/jogging_melange/jogging_melange_diff_1k.png — 5797766 bytes — `a4dd5a852b19eb68adfcc39037f6e7d55acc6056917743afe7e168841d4ceba0`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/jogging_melange/jogging_melange_nor_gl_1k.png — 5681108 bytes — `d46d910a5d8c3bd3facf32528b8b28f413665996824f6a47850b1723abf19b14`
  - https://dl.polyhaven.org/file/ph-assets/Textures/png/1k/jogging_melange/jogging_melange_rough_1k.png — 1993383 bytes — `12d167f4128804260d11ea3ee6204c6c72087539c445263ece2d492eec05573c`

## WP-P0-05c

### Assets

| Asset | Provider | Author(s) | License | Made by | Used for |
| --- | --- | --- | --- | --- | --- |
| [Paper 004](https://ambientcg.com/view?id=Paper004) (`ambientcg/Paper004@2K-PNG`) | ambientCG | Lennart Demes (ambientCG) | [CC0-1.0](https://docs.ambientcg.com/license/) | Photo with approximated PBR maps | cardboard |

### Downloads (URL and SHA-256)

- `ambientcg/Paper004@2K-PNG`
  - https://ambientcg.com/get?file=Paper004_2K-PNG.zip — 65341477 bytes — `3948835027536dc829014351897b92dc2cf5675a133f84d707c72659249d6028`

## WP-P1-models

Furniture and prop models from Poly Haven at 1k (glTF with JPEG textures), shipped under
`assets/models/<name>/` with each texture also encoded to KTX2 by `node tools/models/fetch.mjs` (pinned list `tools/models/models.json`).

### Assets

| Asset | Provider | Author(s) | License | Made by | Used for |
| --- | --- | --- | --- | --- | --- |
| [Sofa 01](https://polyhaven.com/a/Sofa_01) (`polyhaven/Sofa_01@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/sofa_01 (sofa) |
| [Sofa 02](https://polyhaven.com/a/sofa_02) (`polyhaven/sofa_02@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/sofa_02 (sofa) |
| [Sofa 03](https://polyhaven.com/a/sofa_03) (`polyhaven/sofa_03@1k`) | Poly Haven | Fran Calvente | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/sofa_03 (sofa) |
| [Arm Chair 01](https://polyhaven.com/a/ArmChair_01) (`polyhaven/ArmChair_01@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/armchair_01 (armchair) |
| [Modern Arm Chair 01](https://polyhaven.com/a/modern_arm_chair_01) (`polyhaven/modern_arm_chair_01@1k`) | Poly Haven | Vibrant Nordic | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/modern_arm_chair_01 (armchair) |
| [Steel Frame Shelves 01](https://polyhaven.com/a/steel_frame_shelves_01) (`polyhaven/steel_frame_shelves_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/steel_frame_shelves_01 (rack) |
| [Steel Frame Shelves 02](https://polyhaven.com/a/steel_frame_shelves_02) (`polyhaven/steel_frame_shelves_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/steel_frame_shelves_02 (rack) |
| [Worn Metal Rack](https://polyhaven.com/a/worn_metal_rack) (`polyhaven/worn_metal_rack@1k`) | Poly Haven | Luca B | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/worn_metal_rack (rack) |
| [Wooden Bookshelf Worn](https://polyhaven.com/a/wooden_bookshelf_worn) (`polyhaven/wooden_bookshelf_worn@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_bookshelf_worn (bookshelf) |
| [Shelf 01](https://polyhaven.com/a/Shelf_01) (`polyhaven/Shelf_01@1k`) | Poly Haven | Gabriel Radić | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/shelf_01 (bookshelf) |
| [Wooden Display Shelves 01](https://polyhaven.com/a/wooden_display_shelves_01) (`polyhaven/wooden_display_shelves_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_display_shelves_01 (bookshelf) |
| [Drawer Cabinet](https://polyhaven.com/a/drawer_cabinet) (`polyhaven/drawer_cabinet@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/drawer_cabinet (cabinet) |
| [Painted Wooden Cabinet](https://polyhaven.com/a/painted_wooden_cabinet) (`polyhaven/painted_wooden_cabinet@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_cabinet (cabinet) |
| [Painted Wooden Cabinet 02](https://polyhaven.com/a/painted_wooden_cabinet_02) (`polyhaven/painted_wooden_cabinet_02@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_cabinet_02 (cabinet) |
| [Vintage Cabinet 01](https://polyhaven.com/a/vintage_cabinet_01) (`polyhaven/vintage_cabinet_01@1k`) | Poly Haven | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_cabinet_01 (cabinet) |
| [Painted Wooden Nightstand](https://polyhaven.com/a/painted_wooden_nightstand) (`polyhaven/painted_wooden_nightstand@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_nightstand (cabinet) |
| [Classic Nightstand 01](https://polyhaven.com/a/ClassicNightstand_01) (`polyhaven/ClassicNightstand_01@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/classicnightstand_01 (cabinet) |
| [Vintage Wooden Drawer 01](https://polyhaven.com/a/vintage_wooden_drawer_01) (`polyhaven/vintage_wooden_drawer_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_wooden_drawer_01 (cabinet) |
| [Gothic Commode 01](https://polyhaven.com/a/GothicCommode_01) (`polyhaven/GothicCommode_01@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/gothiccommode_01 (cabinet) |
| [Wooden Table 01](https://polyhaven.com/a/WoodenTable_01) (`polyhaven/WoodenTable_01@1k`) | Poly Haven | Ethan Place | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/woodentable_01 (table) |
| [Wooden Table 03](https://polyhaven.com/a/WoodenTable_03) (`polyhaven/WoodenTable_03@1k`) | Poly Haven | Gabriel Radić | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/woodentable_03 (table) |
| [Wooden Table 02](https://polyhaven.com/a/wooden_table_02) (`polyhaven/wooden_table_02@1k`) | Poly Haven | Serhii Khromov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_table_02 (table) |
| [Round Wooden Table 02](https://polyhaven.com/a/round_wooden_table_02) (`polyhaven/round_wooden_table_02@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/round_wooden_table_02 (table) |
| [Side Table 01](https://polyhaven.com/a/side_table_01) (`polyhaven/side_table_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/side_table_01 (table) |
| [Small Wooden Table 01](https://polyhaven.com/a/small_wooden_table_01) (`polyhaven/small_wooden_table_01@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/small_wooden_table_01 (table) |
| [Painted Wooden Table](https://polyhaven.com/a/painted_wooden_table) (`polyhaven/painted_wooden_table@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_table (table) |
| [Coffee Table 01](https://polyhaven.com/a/CoffeeTable_01) (`polyhaven/CoffeeTable_01@1k`) | Poly Haven | Fernando Quinn | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/coffeetable_01 (coffeetable) |
| [Modern Coffee Table 01](https://polyhaven.com/a/modern_coffee_table_01) (`polyhaven/modern_coffee_table_01@1k`) | Poly Haven | Amin | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/modern_coffee_table_01 (coffeetable) |
| [Industrial Coffee Table](https://polyhaven.com/a/industrial_coffee_table) (`polyhaven/industrial_coffee_table@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/industrial_coffee_table (coffeetable) |
| [Coffee Table Round 01](https://polyhaven.com/a/coffee_table_round_01) (`polyhaven/coffee_table_round_01@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/coffee_table_round_01 (coffeetable) |
| [Metal Office Desk](https://polyhaven.com/a/metal_office_desk) (`polyhaven/metal_office_desk@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_office_desk (desk) |
| [School Desk 01](https://polyhaven.com/a/SchoolDesk_01) (`polyhaven/SchoolDesk_01@1k`) | Poly Haven | Ethan Place | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/schooldesk_01 (desk) |
| [Painted Wooden Chair 01](https://polyhaven.com/a/painted_wooden_chair_01) (`polyhaven/painted_wooden_chair_01@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_chair_01 (chair) |
| [School Chair 01](https://polyhaven.com/a/SchoolChair_01) (`polyhaven/SchoolChair_01@1k`) | Poly Haven | Ethan Place | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/schoolchair_01 (chair) |
| [Plastic Monobloc Chair 01](https://polyhaven.com/a/plastic_monobloc_chair_01) (`polyhaven/plastic_monobloc_chair_01@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/plastic_monobloc_chair_01 (chair) |
| [Dining Chair 02](https://polyhaven.com/a/dining_chair_02) (`polyhaven/dining_chair_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/dining_chair_02 (chair) |
| [Wooden Stool 01](https://polyhaven.com/a/wooden_stool_01) (`polyhaven/wooden_stool_01@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_stool_01 (chair) |
| [Metal Stool 02](https://polyhaven.com/a/metal_stool_02) (`polyhaven/metal_stool_02@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_stool_02 (chair) |
| [Painted Wooden Stool](https://polyhaven.com/a/painted_wooden_stool) (`polyhaven/painted_wooden_stool@1k`) | Poly Haven | Kirill Sannikov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/painted_wooden_stool (chair) |
| [Old Bed Frame](https://polyhaven.com/a/old_bed_frame) (`polyhaven/old_bed_frame@1k`) | Poly Haven | Luca B | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/old_bed_frame (bed) |
| [Vintage Day Bed](https://polyhaven.com/a/vintage_day_bed) (`polyhaven/vintage_day_bed@1k`) | Poly Haven | Aron Łyczek | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_day_bed (bed) |
| [Television 01](https://polyhaven.com/a/Television_01) (`polyhaven/Television_01@1k`) | Poly Haven | Gabriel Radić | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/television_01 (tv) |
| [Television 02](https://polyhaven.com/a/television_02) (`polyhaven/television_02@1k`) | Poly Haven | Benny Weimer | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/television_02 (tv) |
| [Electric Stove](https://polyhaven.com/a/electric_stove) (`polyhaven/electric_stove@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/electric_stove (stove) |
| [Portable Generator](https://polyhaven.com/a/portable_generator) (`polyhaven/portable_generator@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/portable_generator (generator) |
| [Cardboard Box 01](https://polyhaven.com/a/cardboard_box_01) (`polyhaven/cardboard_box_01@1k`) | Poly Haven | Rahul Chaudhary | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/cardboard_box_01 (crate) |
| [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01) (`polyhaven/wooden_crate_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_crate_01 (crate) |
| [Wooden Crate 02](https://polyhaven.com/a/wooden_crate_02) (`polyhaven/wooden_crate_02@1k`) | Poly Haven | James Ray Cock, Jurita Burger | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_crate_02 (crate) |
| [Plastic Crate 01](https://polyhaven.com/a/plastic_crate_01) (`polyhaven/plastic_crate_01@1k`) | Poly Haven | PierreB3D | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/plastic_crate_01 (crate) |
| [Plastic Crate 02](https://polyhaven.com/a/plastic_crate_02) (`polyhaven/plastic_crate_02@1k`) | Poly Haven | Fabi_G | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/plastic_crate_02 (crate) |
| [Wooden Military Crate](https://polyhaven.com/a/wooden_military_crate) (`polyhaven/wooden_military_crate@1k`) | Poly Haven | Prabhjinder Singh | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_military_crate (crate) |
| [Old Military Crate](https://polyhaven.com/a/old_military_crate) (`polyhaven/old_military_crate@1k`) | Poly Haven | Jack Mava | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/old_military_crate (crate) |
| [Metal Toolbox](https://polyhaven.com/a/metal_toolbox) (`polyhaven/metal_toolbox@1k`) | Poly Haven | Mateusz Sadek | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_toolbox (crate) |
| [Barrel_01](https://polyhaven.com/a/Barrel_01) (`polyhaven/Barrel_01@1k`) | Poly Haven | Jorge Camacho | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/barrel_01 (barrel) |
| [Barrel 02](https://polyhaven.com/a/Barrel_02) (`polyhaven/Barrel_02@1k`) | Poly Haven | Jorge Camacho | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/barrel_02 (barrel) |
| [Barrel 03](https://polyhaven.com/a/barrel_03) (`polyhaven/barrel_03@1k`) | Poly Haven | Serhii Khromov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/barrel_03 (barrel) |
| [Metal Jerrycan](https://polyhaven.com/a/metal_jerrycan) (`polyhaven/metal_jerrycan@1k`) | Poly Haven | Sean Buckley | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_jerrycan (barrel) |
| [Metal Jerrycan Green](https://polyhaven.com/a/metal_jerrycan_green) (`polyhaven/metal_jerrycan_green@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_jerrycan_green (barrel) |
| [Plastic Jerrycan](https://polyhaven.com/a/plastic_jerrycan) (`polyhaven/plastic_jerrycan@1k`) | Poly Haven | Ulan Cabanilla | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/plastic_jerrycan (barrel) |
| [Wooden Bucket 02](https://polyhaven.com/a/wooden_bucket_02) (`polyhaven/wooden_bucket_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_bucket_02 (bucket) |
| [Wicker Basket 01](https://polyhaven.com/a/wicker_basket_01) (`polyhaven/wicker_basket_01@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wicker_basket_01 (bucket) |
| [Potted Plant 01](https://polyhaven.com/a/potted_plant_01) (`polyhaven/potted_plant_01@1k`) | Poly Haven | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/potted_plant_01 (plant) |
| [Potted Plant 02](https://polyhaven.com/a/potted_plant_02) (`polyhaven/potted_plant_02@1k`) | Poly Haven | Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/potted_plant_02 (plant) |
| [Potted Plant 04](https://polyhaven.com/a/potted_plant_04) (`polyhaven/potted_plant_04@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/potted_plant_04 (plant) |
| [Planter Box 01](https://polyhaven.com/a/planter_box_01) (`polyhaven/planter_box_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/planter_box_01 (plant) |
| [Planter Box 02](https://polyhaven.com/a/planter_box_02) (`polyhaven/planter_box_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/planter_box_02 (plant) |
| [Planter Box 03](https://polyhaven.com/a/planter_box_03) (`polyhaven/planter_box_03@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/planter_box_03 (plant) |
| [Planter Pot Clay](https://polyhaven.com/a/planter_pot_clay) (`polyhaven/planter_pot_clay@1k`) | Poly Haven | Amal Kumar | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/planter_pot_clay (plant) |
| [Tool Cart](https://polyhaven.com/a/tool_cart) (`polyhaven/tool_cart@1k`) | Poly Haven | Savva Zakharov | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/tool_cart (workbench) |
| [Metal Tool Chest](https://polyhaven.com/a/metal_tool_chest) (`polyhaven/metal_tool_chest@1k`) | Poly Haven | Yann Kervran, John Hutcheson | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_tool_chest (workbench) |
| [Industrial Storage Cart](https://polyhaven.com/a/industrial_storage_cart) (`polyhaven/industrial_storage_cart@1k`) | Poly Haven | Jule Bielitz | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/industrial_storage_cart (workbench) |
| [Vintage Microwave](https://polyhaven.com/a/vintage_microwave) (`polyhaven/vintage_microwave@1k`) | Poly Haven | Adam Nekola | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_microwave (appliance) |
| [Boombox](https://polyhaven.com/a/boombox) (`polyhaven/boombox@1k`) | Poly Haven | Thomas Paul Mouilleron | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/boombox (appliance) |
| [Vintage Radio Transceiver](https://polyhaven.com/a/vintage_radio_transceiver) (`polyhaven/vintage_radio_transceiver@1k`) | Poly Haven | Mateusz Sadek | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_radio_transceiver (appliance) |
| [Cash Register 01](https://polyhaven.com/a/CashRegister_01) (`polyhaven/CashRegister_01@1k`) | Poly Haven | Joe Seabuhr | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/cashregister_01 (appliance) |
| [Vintage Electric Kettle](https://polyhaven.com/a/vintage_electric_kettle) (`polyhaven/vintage_electric_kettle@1k`) | Poly Haven | SV Garip | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/vintage_electric_kettle (appliance) |
| [Classic Laptop](https://polyhaven.com/a/classic_laptop) (`polyhaven/classic_laptop@1k`) | Poly Haven | Arrangemonk | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/classic_laptop (appliance) |
| [Cassette Player](https://polyhaven.com/a/cassette_player) (`polyhaven/cassette_player@1k`) | Poly Haven | Oday Abuzaeed | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/cassette_player (appliance) |
| [Desk Lamp Arm 01](https://polyhaven.com/a/desk_lamp_arm_01) (`polyhaven/desk_lamp_arm_01@1k`) | Poly Haven | Yann Kervran, Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/desk_lamp_arm_01 (lamp) |
| [Modern Ceiling Lamp 01](https://polyhaven.com/a/modern_ceiling_lamp_01) (`polyhaven/modern_ceiling_lamp_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/modern_ceiling_lamp_01 (lamp) |
| [Industrial Wall Lamp](https://polyhaven.com/a/industrial_wall_lamp) (`polyhaven/industrial_wall_lamp@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/industrial_wall_lamp (lamp) |
| [Dartboard](https://polyhaven.com/a/dartboard) (`polyhaven/dartboard@1k`) | Poly Haven | Satyaki Mandal | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/dartboard (wall) |
| [Hanging Picture Frame 01](https://polyhaven.com/a/hanging_picture_frame_01) (`polyhaven/hanging_picture_frame_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/hanging_picture_frame_01 (wall) |
| [Hanging Picture Frame 02](https://polyhaven.com/a/hanging_picture_frame_02) (`polyhaven/hanging_picture_frame_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/hanging_picture_frame_02 (wall) |
| [Wall Clock](https://polyhaven.com/a/wall_clock) (`polyhaven/wall_clock@1k`) | Poly Haven | PierreB3D | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wall_clock (wall) |
| [Fancy Picture Frame 01](https://polyhaven.com/a/fancy_picture_frame_01) (`polyhaven/fancy_picture_frame_01@1k`) | Poly Haven | Rob Tuytel, Rico Cilliers | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/fancy_picture_frame_01 (wall) |
| [Barrel Stove](https://polyhaven.com/a/barrel_stove) (`polyhaven/barrel_stove@1k`) | Poly Haven | MP | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/barrel_stove (heater) |
| [Exterior Aircon Unit](https://polyhaven.com/a/exterior_aircon_unit) (`polyhaven/exterior_aircon_unit@1k`) | Poly Haven | Monsta3D | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/exterior_aircon_unit (heater) |
| [Street Lamp 02](https://polyhaven.com/a/street_lamp_02) (`polyhaven/street_lamp_02@1k`) | Poly Haven | Josh Dean | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/street_lamp_02 (exterior) |
| [Utility Box 01](https://polyhaven.com/a/utility_box_01) (`polyhaven/utility_box_01@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/utility_box_01 (exterior) |
| [Utility Box 02](https://polyhaven.com/a/utility_box_02) (`polyhaven/utility_box_02@1k`) | Poly Haven | James Ray Cock | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/utility_box_02 (exterior) |
| [Metal Trash Can](https://polyhaven.com/a/metal_trash_can) (`polyhaven/metal_trash_can@1k`) | Poly Haven | GurJas Studios | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/metal_trash_can (exterior) |
| [Water Manhole Cover](https://polyhaven.com/a/water_manhole_cover) (`polyhaven/water_manhole_cover@1k`) | Poly Haven | Raunox | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/water_manhole_cover (exterior) |
| [Wooden Ladder](https://polyhaven.com/a/wooden_ladder) (`polyhaven/wooden_ladder@1k`) | Poly Haven | Miroslav Turura | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wooden_ladder (exterior) |
| [Wet Floor Sign 01](https://polyhaven.com/a/WetFloorSign_01) (`polyhaven/WetFloorSign_01@1k`) | Poly Haven | Fran Calvente | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/wetfloorsign_01 (misc) |
| [Fire Alarm](https://polyhaven.com/a/fire_alarm) (`polyhaven/fire_alarm@1k`) | Poly Haven | Slinc | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/fire_alarm (misc) |
| [All Purpose Cleaner](https://polyhaven.com/a/all_purpose_cleaner) (`polyhaven/all_purpose_cleaner@1k`) | Poly Haven | Kuutti Siitonen | [CC0-1.0](https://polyhaven.com/license) | 3D model | models/all_purpose_cleaner (misc) |

### Downloads (URL and SHA-256)

- `polyhaven/Sofa_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Sofa_01/Sofa_01_1k.gltf — 2636 bytes — `dc9d331a24fc8994606ae5a283826cb28feb3166782f59d006d0f10cc92cc830`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/Sofa_01/Sofa_01.bin — 111264 bytes — `c8af86de6db09a6d49703e0e51cf8acafa23fb2ee945e66a48225dced3a154e1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Sofa_01/Sofa_01_arm_1k.jpg — 114593 bytes — `fc5db69e4cf5cf9f881b2d134fae69c4e3b1a96378f131752ef48060bf0c5e39`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Sofa_01/Sofa_01_diff_1k.jpg — 134925 bytes — `1772047e7887a9ec44878e0720eda0829abfa744dec6ca03b492a31c4dc51cab`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Sofa_01/Sofa_01_nor_gl_1k.jpg — 154517 bytes — `1d89009f9fba3b6967d63cb718606b3049d2423bc031da12ee228718a0571e84`
- `polyhaven/sofa_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/sofa_02/sofa_02_1k.gltf — 4183 bytes — `5df114209f9b956ccd4831eaeef469a81339ab371d0056eb6d5d29eee08eb431`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/sofa_02/sofa_02.bin — 74864 bytes — `cb337e03211be0309afa1ded2b6cbb2d402c0f794aaf8828fba559d27a42d3f5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_02/sofa_02_arm_1k.jpg — 121752 bytes — `f2813f32cd9ec42a9080590d0953ac9e272d9baa0b22fdb5910bf325157393c6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_02/sofa_02_diff_1k.jpg — 86514 bytes — `4ff65c782578b52eee89cb96cc4e258ce1b6848e1a7655019af1f7207c749840`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_02/sofa_02_nor_gl_1k.jpg — 139858 bytes — `c97a359703a8ce1cee62cbd9dc4013b611d821afb7769810983b464ebc5d0cfe`
- `polyhaven/sofa_03@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/sofa_03/sofa_03_1k.gltf — 4465 bytes — `123f491bef4e9bda153bda770a5d12810bfc9b87ce56aa5973aed041ea17fd92`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/sofa_03/sofa_03.bin — 228984 bytes — `e524350933d3d2a84c28f13bc042888a4768adeef88d630111015caede1c2e98`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_03/sofa_03_diff_1k.jpg — 151815 bytes — `c0bc221e4cacc3de75aff7744dab1600d008bcf70b5c67fb10ad6847b695a84e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_03/sofa_03_nor_gl_1k.jpg — 112563 bytes — `b961f9e9f38233bd58cdc5275614d3a1b37d5304f5ab86fd19d110657d386025`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/sofa_03/sofa_03_rough_1k.jpg — 170206 bytes — `b03b45c92365cddf787db158d7499915d6ba0d67ec51947453f6598f51361e47`
- `polyhaven/ArmChair_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/ArmChair_01/ArmChair_01_1k.gltf — 2643 bytes — `91e39d5b35f36c8074b7b6432f6fd77f5f1a257c4d6af3924c0b263eb674286b`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/ArmChair_01/ArmChair_01.bin — 154012 bytes — `42a4206ea8bb3f7c3c1500ca3e408e084e8687cd3cc9cbf095b3344e215e0db6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ArmChair_01/Armchair_01_arm_1k.jpg — 138327 bytes — `d272c68e8180f2a381314ac0cef5a9165d15d951a0558cb40a17af71cf6a51c6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ArmChair_01/Armchair_01_diff_1k.jpg — 184246 bytes — `db30fc9ab61ac50c91ab7573583d2855a2910df1ecade02b89e3e8ab8d4e4c2d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ArmChair_01/Armchair_01_nor_gl_1k.jpg — 289916 bytes — `f5e4a43a12e79537e53e27c2bd4c5296b3e191cd6b301afce9fafd9d38238dde`
- `polyhaven/modern_arm_chair_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/modern_arm_chair_01/modern_arm_chair_01_1k.gltf — 5121 bytes — `d31be520add2603447b43acedbdacf9516866f7c89e9ea9230c9edbac9cc6e6a`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/modern_arm_chair_01/modern_arm_chair_01.bin — 240728 bytes — `8755f2f498c0bb165660379d1b045465751c16bbeaf553c8dd76bb14c16d1ff6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_legs_arm_1k.jpg — 577931 bytes — `c76b65200a52cf649a865baf7f879dc34277b923edaac7ec8164eaf7c51c935d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_legs_diff_1k.jpg — 460937 bytes — `6291421a8db6cd9bbbc8c141aa087465d698427249f813d24c6e5ccdbf0bf536`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_legs_nor_gl_1k.jpg — 560864 bytes — `af328e8530884907cf0d38a675338bb4e2b03c56ed2d21eb5abf505bb67c11de`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_pillow_arm_1k.jpg — 321223 bytes — `fec333290ddfd70e78428251874d30d5410d6d0a956dd84922b0d3f3596e4b7a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_pillow_diff_1k.jpg — 228851 bytes — `f1935436b460ad5c03ac7ff9d1e1b4aaedcdc9a503d79c257beb8cdac2e9e1f7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_arm_chair_01/modern_arm_chair_01_pillow_nor_gl_1k.jpg — 302377 bytes — `2717b9d22e1d3533e3c7436a0230b00b1d25bf396246679825c8db08edaba0a8`
- `polyhaven/steel_frame_shelves_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/steel_frame_shelves_01/steel_frame_shelves_01_1k.gltf — 2766 bytes — `4eff8994825d654e337f8dc425e959ed6add7f4773188c87ba64402d9edd9842`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/steel_frame_shelves_01/steel_frame_shelves_01.bin — 142312 bytes — `306d7e72d12a5d3047b8a189f8d0add51075eaf7f51f935286fda4e1c16dd066`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_01/steel_frame_shelves_01_arm_1k.jpg — 655560 bytes — `858629eeaa8f68ddb4fc1a813afe6ed988ded3d6d49184ec45a14611760f0bb3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_01/steel_frame_shelves_01_diff_1k.jpg — 477882 bytes — `85e205b334e15e05bec9b02be1258da6ab949ae908aa57e0bee6b94ba45b4415`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_01/steel_frame_shelves_01_nor_gl_1k.jpg — 318836 bytes — `2a67ed7dd4f53c3e225396e6381992b768fe58b5261be703d540678e366e46ed`
- `polyhaven/steel_frame_shelves_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/steel_frame_shelves_02/steel_frame_shelves_02_1k.gltf — 2775 bytes — `df103b9fbb08a60e262cc1d8af5cb37f3c1231a8764eeacec23d363be24feca6`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/steel_frame_shelves_02/steel_frame_shelves_02.bin — 142344 bytes — `bcfe8e37632961b13f7ac845f7f2505181c394e7bd356c123a0ef7706aabd70d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_02/steel_frame_shelves_02_arm_1k.jpg — 199312 bytes — `7fbcad4858018270eec05cbcdfec886adf4de39a057a8fc15a3c1d1d009f0307`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_02/steel_frame_shelves_02_diff_1k.jpg — 144386 bytes — `2b41f59f3fbc6464e10ce11ee17c80f35173de8321865e4c4a966c55f5898f15`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/steel_frame_shelves_02/steel_frame_shelves_02_nor_gl_1k.jpg — 51446 bytes — `c0033947364a267d17307943df975bc9d81268b51532c73340dd0bf45d204990`
- `polyhaven/worn_metal_rack@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/worn_metal_rack/worn_metal_rack_1k.gltf — 2796 bytes — `e757448bd448460ecb6c7218e7857c8d071f271e3cdc2bd013ca63d824c0c308`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/worn_metal_rack/worn_metal_rack_arm_1k.jpg — 696941 bytes — `b3523f947b3ebd960d508361bb323cec5a959d0b7043a8a7118ffab781925a65`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/worn_metal_rack/worn_metal_rack_diff_1k.jpg — 604202 bytes — `295c2d48ad55289fed76b7438513520cadd94516639ab8ffd8790ffe7c903dbb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/worn_metal_rack/worn_metal_rack_nor_gl_1k.jpg — 435767 bytes — `3222c47e6fac0d103afec06b8a53476828777f5282d6703266010ecf587ad49e`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/worn_metal_rack/worn_metal_rack.bin — 269400 bytes — `b8cfa4138b7c0e0e69738c6f24dec7fecdc2f336f524312db48167816776fd13`
- `polyhaven/wooden_bookshelf_worn@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_bookshelf_worn/wooden_bookshelf_worn_1k.gltf — 2849 bytes — `a1c5b3f1e71ae0b5eb73047e8097bceaa5f17e5d2d0d7ae1b8053d5ec0878fc6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bookshelf_worn/wooden_bookshelf_worn_arm_1k.jpg — 713979 bytes — `41b3aca38fb55cb300d971016a597c80425da3744a6d33d82fe78f9dbe609eaa`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bookshelf_worn/wooden_bookshelf_worn_diff_1k.jpg — 799126 bytes — `970f60178decadd0d8fb1e5872f718350a49b027fd69469210c41ead350cba56`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bookshelf_worn/wooden_bookshelf_worn_nor_gl_1k.jpg — 993276 bytes — `90ffb1b3f7bb638d5a7e1a2b244a260d623e314a6010a6b8c23c57203e510ac9`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/wooden_bookshelf_worn/wooden_bookshelf_worn.bin — 267964 bytes — `170758113b50132380ab46943f6eab18f2714460dead065aae37241a94abf0f9`
- `polyhaven/Shelf_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Shelf_01/Shelf_01_1k.gltf — 2617 bytes — `715bce6ff1886eccdd43d558f5cf9242a24396e0eb9e8ae391905186bb339e52`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/Shelf_01/Shelf_01.bin — 12676 bytes — `21ee76dda6320ba423e76d192cfd38885e334ae394c03978d092f96b508f175b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Shelf_01/Shelf_01_arm_1k.jpg — 205542 bytes — `d5d180b15c48ed6ab7b27a663de8f399f813ed0c32ff2706520d677a1e387cdc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Shelf_01/Shelf_01_diff_1k.jpg — 153220 bytes — `875bb8110dec4f409d9127cba95f7c0ead02bdfeef6dd47232df939e4de35a5c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Shelf_01/Shelf_01_nor_gl_1k.jpg — 231393 bytes — `c817d7966974be2da13e4b0a57918e8e142edc50eb41d438229c3bad70df0f91`
- `polyhaven/wooden_display_shelves_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_display_shelves_01/wooden_display_shelves_01_1k.gltf — 6795 bytes — `3784953c451b088d24ac1b0e6946c7f7bd589115f51e6549fdb8fe9f7c10600e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_display_shelves_01/wooden_display_shelves_01_arm_1k.jpg — 164353 bytes — `33d6b769eafab3b1d8605b202cd41b0994b8c43df02dca5bdd86e942e390ff6a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_display_shelves_01/wooden_display_shelves_01_diff_1k.jpg — 139254 bytes — `cb57e90d9588ce81e58ff7300e89956a6a3c45119165b858d921a5a2439cbeaf`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_display_shelves_01/wooden_display_shelves_01_nor_gl_1k.jpg — 54739 bytes — `04191c25bfb8e76314863b624233807792df64fa1a638c75d20788becb4cbb8c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wooden_display_shelves_01/wooden_display_shelves_01.bin — 105988 bytes — `e6c000a780626e618c1f1c0c1ec2ec29e1452e7824055ba53b40963d857edfbe`
- `polyhaven/drawer_cabinet@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/drawer_cabinet/drawer_cabinet_1k.gltf — 8031 bytes — `899581e6a041644139a138f909c6ba001684cc55b5d1702e08f01094e20d0617`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/drawer_cabinet/drawer_cabinet.bin — 798852 bytes — `3460b9fe00ffbe779b7f7f2de3b159c214cfec275c06194add0eebd951ee14e9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/drawer_cabinet/drawer_cabinet_arm_1k.jpg — 124942 bytes — `8f8eefaaadcee247204c5658c2f4d9cac598222336918b01eb48e4190317788c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/drawer_cabinet/drawer_cabinet_diff_1k.jpg — 150011 bytes — `0fe270409b54a5609662dda14afaa94af4bd3267dcd83dd824e05fa880d96efb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/drawer_cabinet/drawer_cabinet_nor_gl_1k.jpg — 61593 bytes — `26d0904ad341353e095ef619d157a5f416be014500475976f1144827cc849faa`
- `polyhaven/painted_wooden_cabinet@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_cabinet/painted_wooden_cabinet_1k.gltf — 9253 bytes — `ce04543cdb10e05fe9c2cc08e9c118b16c1c717a07bcbfac9b99859465c8d1ed`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/painted_wooden_cabinet/painted_wooden_cabinet.bin — 78072 bytes — `1023d773d84c42f2709ec297247d90b0e2833e37241fbe852e2f33b41ae10cda`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet/painted_wooden_cabinet_arm_1k.jpg — 622122 bytes — `34e0bcb00a62704d85161d41e844e798d4f894e416e7769079d50a21d561d171`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet/painted_wooden_cabinet_diff_1k.jpg — 688654 bytes — `2dbed9f9ec8e49fc2e87de8cd86e2029a80e9001b5102b4e47c7dfa913f34d89`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet/painted_wooden_cabinet_nor_gl_1k.jpg — 463678 bytes — `e94edf68faeaf68016c28da9b9f299bb38c57463acd94130ecf98dcaef790016`
- `polyhaven/painted_wooden_cabinet_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_cabinet_02/painted_wooden_cabinet_02_1k.gltf — 6085 bytes — `a4b697adf7a24a081b8452f5a7d482765e2139cf2a6687a4cbb2a7b8bea24325`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/painted_wooden_cabinet_02/painted_wooden_cabinet_02.bin — 39332 bytes — `7acab853993b90cafc9c7550a7035397dfeb4bbda7f0dba8759d40a971c755ca`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet_02/painted_wooden_cabinet_02_arm_1k.jpg — 463616 bytes — `0cf309449d4b0c1ecb0a3adbc17837b6f77f36cb45c1f0ceb6013b07fac44214`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet_02/painted_wooden_cabinet_02_diff_1k.jpg — 560790 bytes — `ddb2cace49bb05b8e03e6c205223a69f95e5eef84ec66e97e5d0e49d2a1af09e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_cabinet_02/painted_wooden_cabinet_02_nor_gl_1k.jpg — 526407 bytes — `46e8df6be06eca30a05d0e90f12e8799e6e11c73ab7c910cc3541b0833ee0103`
- `polyhaven/vintage_cabinet_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_cabinet_01/vintage_cabinet_01_1k.gltf — 22562 bytes — `ce66c642cb13ba11bf7cde72bb58ad465dce1909dbef8a22dd55b28d857c1848`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_a_arm_1k.jpg — 157915 bytes — `0f5970977780b6dbb202f1371777b7b616dee9da7e01760eee306c2202ffeb17`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_a_diff_1k.jpg — 119782 bytes — `06453bb3e2811147a7558914437c20042f3f5c21b9c4f1d3488bdfe94f25f03f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_a_nor_gl_1k.jpg — 109236 bytes — `08d64582202f32c8f2250ee2061dc870678ac694206f9b4edf2acd11e33323a4`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_a_rough_1k.jpg — 133697 bytes — `a641d1ac6b43ca25eb1b26e631057b79c3f2ab1b39a3460a5894b5c3dd22b420`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_b_diff_1k.jpg — 124307 bytes — `81967dbb387b205b2aa6f253165c8c44f60cdf5e57d9ceebf230fef21569b33a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_b_nor_gl_1k.jpg — 52162 bytes — `c9580fbf1f69d7bc23817216e2954c713c87aceb5c4f04b9b1a5233c2cf2ce7b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_cabinet_01/vintage_cabinet_01_b_rough_1k.jpg — 155539 bytes — `1f11ec7fdea1b6a9ce7ea8a3d2110f944860aeb72dce4d017b8d2880582dfb20`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/vintage_cabinet_01/vintage_cabinet_01.bin — 1995776 bytes — `407c58be2c5efb1d41d549fcff6a57d18d025033803dcb241e57349dd65bcf60`
- `polyhaven/painted_wooden_nightstand@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_nightstand/painted_wooden_nightstand_1k.gltf — 4427 bytes — `fbdc51ee41f2ee2dc7c455cd6f8321ff14e80c7a7d1e7736b194ca0b3e48b304`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/painted_wooden_nightstand/painted_wooden_nightstand.bin — 18916 bytes — `67b0834c6d0337bd144a1f72045bfe4de029618766b344fa9ffc4c3fc3ee8865`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_nightstand/painted_wooden_nightstand_arm_1k.jpg — 773123 bytes — `c3724c444d74f5b0e65904de0633bfe99db76f8c9b9211703aeeab62b02031ef`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_nightstand/painted_wooden_nightstand_diff_1k.jpg — 603334 bytes — `bf7447441b2f78c847d7c4cda8b80e604853e2b559ffe03b41c0e4b3bff8ed9f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_nightstand/painted_wooden_nightstand_nor_gl_1k.jpg — 751707 bytes — `2d7574ce96c1202bc37ad49fd219a2f918028e102a6d1743714bc90032295c15`
- `polyhaven/ClassicNightstand_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/ClassicNightstand_01/ClassicNightstand_01_1k.gltf — 2754 bytes — `e8218ceead6c07d2641a0bd54974a67b13dd7ebc110e07e9738e17c206c7b892`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/ClassicNightstand_01/ClassicNightstand_01.bin — 68684 bytes — `1ac0f3065df040e5a85c3807fa07947de7185ad40ed064f3399fa9fc93387a7f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ClassicNightstand_01/ClassicNightstand_01_arm_1k.jpg — 111670 bytes — `2a2ba3094e6baedebdddc1660684f42aa8556e405ef8e540f08ffa5a083adbf3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ClassicNightstand_01/ClassicNightstand_01_diff_1k.jpg — 107526 bytes — `aa841a5dcea9154bb1a26eb1be37d6b69fc8b2777f3dfcc3f7c7880c7048a5c6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/ClassicNightstand_01/ClassicNightstand_01_nor_gl_1k.jpg — 154306 bytes — `42692b8c2645559db4803135c9e3b1e1f11bd8b2022bbe0b750f4c3e5d65c225`
- `polyhaven/vintage_wooden_drawer_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_wooden_drawer_01/vintage_wooden_drawer_01_1k.gltf — 11491 bytes — `d39f4172d6fcbb285272168d585f4929c3ed27f05e7101d4fe1c4580408fb8e1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_wooden_drawer_01/vintage_wooden_drawer_01_arm_1k.jpg — 200855 bytes — `0f6ceab69f8f34adb9cb6213b5a87ac6d8a03ed5efaa72eaedd37d1e1ada37a6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_wooden_drawer_01/vintage_wooden_drawer_01_diff_1k.jpg — 203606 bytes — `6aecebf3f5ea52ce75c1e5cdabbf6cf5bf2844e4d3c5243211e52588d8f3f7a8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_wooden_drawer_01/vintage_wooden_drawer_01_nor_gl_1k.jpg — 154793 bytes — `07312a77e5e5c08a7f72f261dc9517ad837246de70b239859eb5144ddd1725f5`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/vintage_wooden_drawer_01/vintage_wooden_drawer_01.bin — 189056 bytes — `2c0a40a166cf9aa1303975e7b1ac7bcfd413e9aa7fbd6d0bd47643f84833c061`
- `polyhaven/GothicCommode_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/GothicCommode_01/GothicCommode_01_1k.gltf — 7054 bytes — `290602a9d999ddff0073288758e162fbfbb69834c0cd93e83f6691996e94d775`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/GothicCommode_01/GothicCommode_01.bin — 135224 bytes — `1a1d7b7840d7357a21a4825a10df00b7957355c21babced7864592593bd97293`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/GothicCommode_01/GothicCommode_01_arm_1k.jpg — 173750 bytes — `c0a23a8775c8714d5f6cea62af044480b71b935e56eab675ee9b3f0330e5dce5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/GothicCommode_01/GothicCommode_01_diff_1k.jpg — 139422 bytes — `096ec1663936b25f773fd3070c89a732cf3e856187404e9715fa2c8311325800`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/GothicCommode_01/GothicCommode_01_nor_gl_1k.jpg — 148711 bytes — `bafa9433cc98fc52687958989015d7f1b9c4048ac930cb2e1174edef8bd34d8e`
- `polyhaven/WoodenTable_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/WoodenTable_01/WoodenTable_01_1k.gltf — 2688 bytes — `413804e054055c397b4cfbd0916027097d2a20853b165b533007a46d131e1d17`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/WoodenTable_01/WoodenTable_01.bin — 42064 bytes — `1083a3442969d27e18e6a7a454bc164407439e3908bf8f17f5fb24d58cd0172e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_01/WoodenTable_01_arm_1k.jpg — 198099 bytes — `ad876f814215006d35f74670d4fc14a9f6eab386a9307764521449464a1cd6ef`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_01/WoodenTable_01_diff_1k.jpg — 160147 bytes — `9535de577ad6b64deb68457af14240dd9b6d82143da0b6d2bf337660ebd855f3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_01/WoodenTable_01_nor_gl_1k.jpg — 151350 bytes — `330655534ea1fc7c7387b5d2ba5ca3231711a9fa680b980933a3a9c82cdb1c67`
- `polyhaven/WoodenTable_03@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/WoodenTable_03/WoodenTable_03_1k.gltf — 9950 bytes — `d7e7fc5f8941a45c5135cdad7b449ef47447dafe093a1fa6ad4f0d1c5d5046b1`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/WoodenTable_03/WoodenTable_03.bin — 118172 bytes — `16464ee143ae686f3a53c30b810ba9a5c3715964b597bbed40bad2b1df52d66d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_03/WoodenTable_03_arm_1k.jpg — 228450 bytes — `ef53d9a12a08e09aaff3cb2e5c0d68274c5565e2a332d54e406030da042a28fe`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_03/WoodenTable_03_diff_1k.jpg — 154264 bytes — `88647e80098da0c70e395e105bf9652602c8688999e0b4c23ff2886854f59e46`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WoodenTable_03/WoodenTable_03_nor_gl_1k.jpg — 127455 bytes — `354496d5b0f5f41d6b658944b5ac3b759fb11c27231eee1a68f4e6e7d82f2eb3`
- `polyhaven/wooden_table_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_table_02/wooden_table_02_1k.gltf — 2687 bytes — `bb38e301840cb629d72c43c83fdb7fb308518efe2d0bc01e1ed0e9a9e43ed9d3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_table_02/wooden_table_02_arm_1k.jpg — 174545 bytes — `b970a81e4b03f3b8a341c9eb639f112fff1782d681c846255ebc9073cd803ced`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_table_02/wooden_table_02_diff_1k.jpg — 178379 bytes — `2334ac3e23d69222322515d9bad066b4e90d7d81989fe231b8fb12f39179ad9e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_table_02/wooden_table_02_nor_gl_1k.jpg — 122129 bytes — `9470e08e5dab4ab6a7cafab2a488a50fb54fa8f38890e9032c39dcbf7f5846d2`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/wooden_table_02/wooden_table_02.bin — 7576 bytes — `52ed7cc67b3aa403375cf9bd18050e8cc21bcced6532a0183c1a733f0965df6d`
- `polyhaven/round_wooden_table_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/round_wooden_table_02/round_wooden_table_02_1k.gltf — 2851 bytes — `df65c35148280a06efcc06bfa75432bb13f29318e869597fc94f364ce2b55974`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/round_wooden_table_02/round_wooden_table_02.bin — 135412 bytes — `fa9a0ed80be31d9160207913762cedc5de21d1cb37b01a5ae6caa23ce7a741b6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/round_wooden_table_02/round_wooden_table_02_arm_1k.jpg — 677385 bytes — `613d051b4c4e093c5e65eec37d39f6f48ac5476e2cb1b59c4b034f308ef1a7ee`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/round_wooden_table_02/round_wooden_table_02_diff_1k.jpg — 470007 bytes — `9872acedc6be92ef232c581c8e9ce435e4aa0d8f5c4b75e4ce445995a3ef8c28`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/round_wooden_table_02/round_wooden_table_02_nor_gl_1k.jpg — 635637 bytes — `34989b9a15753b964a4d9d6b2673c048ff2c14feedbe4e6adbeb4bf32be8bc8c`
- `polyhaven/side_table_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/side_table_01/side_table_01_1k.gltf — 2700 bytes — `a441125a4f660a23a31601aedd9aa379c6febf2b35171c08814187b5ec5a3309`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/side_table_01/side_table_01.bin — 117784 bytes — `b1f2a0519fc61cded1fdeac8169ac5b077836052671cd39a35cb56576c9aa11e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/side_table_01/side_table_01_arm_1k.jpg — 129725 bytes — `ebaef894800faa2e09df7001c1536055c97648428410a9de76bb191aec00c014`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/side_table_01/side_table_01_diff_1k.jpg — 183315 bytes — `e0d9f2f91bede592868f9b89d141f5e8542524b8356f1b68f0f5c6bb6447731d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/side_table_01/side_table_01_nor_gl_1k.jpg — 71744 bytes — `14850c49ae1e06cf8701eac4fed2163c2ad075978d2878fcaa079dffe1fd1195`
- `polyhaven/small_wooden_table_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/small_wooden_table_01/small_wooden_table_01_1k.gltf — 2764 bytes — `2a33fb09785a9553c3cd4d0c5f8b874bb0fb9f26c8ef2613b65607524411f352`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/small_wooden_table_01/small_wooden_table_01.bin — 92428 bytes — `f0ca88dac6cf094e1ba260ee1bc21756a84a27b5456bcf45bda2227819458d84`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/small_wooden_table_01/small_wooden_table_01_arm_1k.jpg — 154335 bytes — `e1d01aaf54338b61f224e8b08c5b9e9879126ae3908a92cb8ad161bf54078c34`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/small_wooden_table_01/small_wooden_table_01_diff_1k.jpg — 138301 bytes — `ef587bffaf9f65ec81e0777fa6f25d835ed354cef055669c8a783086fd45b9dd`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/small_wooden_table_01/small_wooden_table_01_nor_gl_1k.jpg — 26935 bytes — `7f675805966ce02cd7678687c4fc86c0dfe4b20106486bb0c772143ea8ca3b4b`
- `polyhaven/painted_wooden_table@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_table/painted_wooden_table_1k.gltf — 2830 bytes — `7e1ba86ae2c570e3464c42556e4e6cc09186a99127b86eaf54e7dbecb2fbafc3`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/painted_wooden_table/painted_wooden_table.bin — 25552 bytes — `aac5e2e7411a319b8fdf6915cdb452a3b490179c354c75785a22f560e8413059`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_table/painted_wooden_table_arm_1k.jpg — 649934 bytes — `670863aece034184ac1643ebe3de1254c3565a10b01ce3f9e8ba3a67980b4bb3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_table/painted_wooden_table_diff_1k.jpg — 497417 bytes — `826738d2efab2c5786e498c39dd58edd6479e08c0503619727a2b9b6b2e796dc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_table/painted_wooden_table_nor_gl_1k.jpg — 603760 bytes — `0fe881c3f0c2ef0e4e67fa05280355f9b852adc6447af71a61cc3b15fff66338`
- `polyhaven/CoffeeTable_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/CoffeeTable_01/CoffeeTable_01_1k.gltf — 3182 bytes — `c0b7ce378fc13886c220236941b4d258389d252e337297dc89505b80e43617fb`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/CoffeeTable_01/CoffeeTable_01.bin — 394920 bytes — `1b047e37723ad62b6a204465b22b9fd40936957cee255f20ee65312db227fb11`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CoffeeTable_01/CoffeeTable_01_arm_1k.jpg — 194521 bytes — `b8d7dfe15a11ba361919840f00f360d1133f985ff4321b2e891cf941eb5b51c0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CoffeeTable_01/CoffeeTable_01_diff_1k.jpg — 196775 bytes — `170967df5c50342bb5f0273d1fb99f22cef80a0e7f50264e16dec75d1b2830ba`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CoffeeTable_01/CoffeeTable_01_nor_gl_1k.jpg — 168414 bytes — `0aa55f510be698c7c0e2c0c2deff2a4e892a9343da98bb901daa84e104883de7`
- `polyhaven/modern_coffee_table_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/modern_coffee_table_01/modern_coffee_table_01_1k.gltf — 2771 bytes — `a35d811da4c174d0c888f23353dda21501763dbf5505c66f57fef4b3f613e50c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/modern_coffee_table_01/modern_coffee_table_01.bin — 154864 bytes — `b8fe0d49041b879a5d5962685a39e3daf009679f7b6a88ced1347e6dc6c0851e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_coffee_table_01/modern_coffee_table_01_diff_1k.jpg — 410569 bytes — `069b89dd3ef03ddcbb7b2e6a124b1903aa7848394509121aa19f87bd0ef0218c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_coffee_table_01/modern_coffee_table_01_nor_gl_1k.jpg — 359134 bytes — `43e0d317d0f8418b130c0058c645225ee83b808b1dc0e5e7236bead3bdd77139`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_coffee_table_01/modern_coffee_table_01_rough_1k.jpg — 403959 bytes — `8013b48b0ebb845907f840afcae9cbc915a5205ac82ed99cbba31771febacb0f`
- `polyhaven/industrial_coffee_table@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/industrial_coffee_table/industrial_coffee_table_1k.gltf — 2993 bytes — `e692c26fa4c9179ee2f3f9caa95900e271de4f549e3eabf2b4a3aa1217eaae78`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/industrial_coffee_table/industrial_coffee_table.bin — 1335000 bytes — `a38f03b1a036deb7c959abca531ae2b22c3392de66cba8e9dab2f6a59ab05eca`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_coffee_table/industrial_coffee_table_arm_1k.jpg — 800264 bytes — `6a10ab1b6bb62907654966e39cf53d95a31f93a9cf4c9e0d408cbca1f175ef2c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_coffee_table/industrial_coffee_table_diff_1k.jpg — 574858 bytes — `964a1b580877e607ee8facef0be6fe963db847e160676e28942b2f28c3a8b5b7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_coffee_table/industrial_coffee_table_nor_gl_1k.jpg — 531606 bytes — `a18b3b4509827c84cfa30df0e0d9c207dd09c71d52fc54e34a6d6898d17af968`
- `polyhaven/coffee_table_round_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/coffee_table_round_01/coffee_table_round_01_1k.gltf — 2776 bytes — `58fe785584f8999f760e590b04ce74f83962d42c9440ab9415910f63a31165dc`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/coffee_table_round_01/coffee_table_round_01.bin — 131112 bytes — `9605a0c156bff4ec87e8717a79978d85d4e750d21b3193a3d08bed16e8666035`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/coffee_table_round_01/coffee_table_round_01_arm_1k.jpg — 721708 bytes — `7221b03af475555092abd650798facbb945bf4acf02e48f8697f012d8515bf52`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/coffee_table_round_01/coffee_table_round_01_diff_1k.jpg — 447037 bytes — `422b4a24a4459e1fd6d121aae4f1097dd3e467c7a8036bb1d003f955302f1d28`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/coffee_table_round_01/coffee_table_round_01_nor_gl_1k.jpg — 260520 bytes — `a5912db1918b1ec925efb19179675cafc8832b082f80b2ea35c3a58b45e1aec4`
- `polyhaven/metal_office_desk@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_office_desk/metal_office_desk_1k.gltf — 13510 bytes — `f07032a5ee89aacceebf10fd9fa192c22775ae81861cfb0bdb1594497179373c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_office_desk/metal_office_desk.bin — 229700 bytes — `65b558f41a75ad4822e31cc2a97eb34ed359199279a6bfbd650deb27cef78767`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_office_desk/metal_office_desk_arm_1k.jpg — 721614 bytes — `752916dd9bf8a163dc7e0d3673900791ee6d558bbe23894263ac92b42387f51b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_office_desk/metal_office_desk_diff_1k.jpg — 470831 bytes — `1f02e3e77e8f82a3600664c991bd45c1c187452d61e9ede4336c6f90f7fa3139`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_office_desk/metal_office_desk_nor_gl_1k.jpg — 170875 bytes — `f57eb004937e46392151b803e0cb1d88983958d01ad11d93df78a82cfcc6c407`
- `polyhaven/SchoolDesk_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/SchoolDesk_01/SchoolDesk_01_1k.gltf — 2686 bytes — `9d840b58a9e66ce9dc3d8d5396fb97cf954b12dc27adaf41b8cc78ae1a6404eb`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/SchoolDesk_01/SchoolDesk_01.bin — 127564 bytes — `80d0ece097fde9b1efe15a9babfb6bb1573d228bab6e02e3806cb5eca39c2c0c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolDesk_01/SchoolDesk_01_arm_1k.jpg — 134042 bytes — `ee1e2ea17ca21471b8a4822400ddc6bd3a4d441822a7eb429bef8cb1ab6dd43d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolDesk_01/SchoolDesk_01_diff_1k.jpg — 71566 bytes — `4fed6d98265c6be27b9e6c9b010a5bba55a9aca4edfcc3fae9a12309ca6a5b94`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolDesk_01/SchoolDesk_01_nor_gl_1k.jpg — 85765 bytes — `64de8791fec46894945136190504127d194c1fc8d999e15c639dc94d053581be`
- `polyhaven/painted_wooden_chair_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_chair_01/painted_wooden_chair_01_1k.gltf — 2785 bytes — `34f55ebe1851b89c045dc62d4461c848de3b93c0668e752a2b5f6cbed2d91a5e`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/painted_wooden_chair_01/painted_wooden_chair_01.bin — 37112 bytes — `eaf952048db1e770c45898049b8abe28deb83d3dbbaad81d5e7e43e22a322295`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_chair_01/painted_wooden_chair_01_arm_1k.jpg — 144503 bytes — `9d2de0ea0d630e8e5af05424b1f41b1ae4a80465d27a78eb471cd7f8556db84e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_chair_01/painted_wooden_chair_01_diff_1k.jpg — 168040 bytes — `de67d1f8a0318616a7ee769cbe5c513301c2b25056542d011bb4359498f9e25d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_chair_01/painted_wooden_chair_01_nor_gl_1k.jpg — 140110 bytes — `27301c3ac6a7daf9e0ba418ec85feaa44cc898e61d048211bca57133f22e1807`
- `polyhaven/SchoolChair_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/SchoolChair_01/SchoolChair_01_1k.gltf — 2695 bytes — `1db6aca4bf379c2d568b2068492dcfcda15d764c0c3d98a970055af25b46281e`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/SchoolChair_01/SchoolChair_01.bin — 134912 bytes — `7d64d556ba88d3962778085b9a190f1adb0d84e667bca8ef032c0ae34b31a9fe`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolChair_01/SchoolChair_01_arm_1k.jpg — 104994 bytes — `ff773eb01c9d59130dc3cc0274951ac626d73fa1b2f7eee519af4ca80835568b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolChair_01/SchoolChair_01_diff_1k.jpg — 52590 bytes — `f10ae4dbddfb056ef716770ebd96e0eff0aa6f0b5ad0f263ff51c5cade6e1d8f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/SchoolChair_01/SchoolChair_01_nor_gl_1k.jpg — 189532 bytes — `4ee930562ad26e8c98af75e8aa6577d01cb56f6d22628f4e95c385e5364f0623`
- `polyhaven/plastic_monobloc_chair_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/plastic_monobloc_chair_01/plastic_monobloc_chair_01_1k.gltf — 2892 bytes — `899bf148139ab8d1718c25ec06112a652631f9476b5aaeeacb9eb1da9b7f1d3a`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/plastic_monobloc_chair_01/plastic_monobloc_chair_01.bin — 124808 bytes — `db5c778488d01d7e7d3409e2cda53ee8f6dd523a327c080000d549dd0f83b375`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_monobloc_chair_01/plastic_monobloc_chair_01_arm_1k.jpg — 634320 bytes — `78a67659a19a9df9efc0ef71789de0c949a727db62ade4c4c8887cd2c803c1a2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_monobloc_chair_01/plastic_monobloc_chair_01_diff_1k.jpg — 560823 bytes — `fdd1255a02bf684cfcff2eae75c0e3eea0db1fb5ecbfbd8c4f9beab8fd83ff6c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_monobloc_chair_01/plastic_monobloc_chair_01_nor_gl_1k.jpg — 630024 bytes — `9ffa876b37d72ae1c0aed84d4dc1f62c956c844b3efec1f786f9080c10f63c9e`
- `polyhaven/dining_chair_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/dining_chair_02/dining_chair_02_1k.gltf — 2723 bytes — `88352a44a17319846f61fe03ce75c79fb1849aa508b6a262366c149c1bbd06b8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/dining_chair_02/dining_chair_02.bin — 544592 bytes — `c7f1ef858f73815176d2ab304472a69ccf6097e971e5258eb924a75f841d4af5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_arm_1k.jpg — 162630 bytes — `0a81c0c886baa1e65d94fb6fb90ab4751bee319888ecf1c428ae62042d8a5b15`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_diff_1k.jpg — 91518 bytes — `343990f764790da1149485a422dee2bc6797945a6af06a37d02d7a7de041acf5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dining_chair_02/dining_chair_02_nor_gl_1k.jpg — 119612 bytes — `348703512ca1215f8389e9108419c2d1a46537663db25f423c3ef900d20cfe61`
- `polyhaven/wooden_stool_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_stool_01/wooden_stool_01_1k.gltf — 2715 bytes — `f28566454af27175839c10645a37a2a16b373e4be8aecddd0d8a3d704cfc0330`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_stool_01/wooden_stool_01_diff_1k.jpg — 233863 bytes — `cb5c7ec2e27f5ad2ced7791da5e2cc9f1d03ab2c6ffbb63df8256dc271869206`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_stool_01/wooden_stool_01_nor_gl_1k.jpg — 230812 bytes — `10b587d76b74e752f15d03d2c4725cddb439b174dcddae2444e1534de61d77dc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_stool_01/wooden_stool_01_rough_1k.jpg — 203406 bytes — `23b43e05961731de864e4902a14c614b33d804fd91821c284fa90a8d2ca23fe1`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wooden_stool_01/wooden_stool_01.bin — 290924 bytes — `a9b21b8c75719057db549dfee5b8c1cc76edc2727367790fb9fc49963e34ae7a`
- `polyhaven/metal_stool_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_stool_02/metal_stool_02_1k.gltf — 2897 bytes — `de8d603993443294b8a0aed48ea631ac38f2b15872491ea929551f72be726fcb`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_stool_02/metal_stool_02.bin — 182872 bytes — `17127317d391eb90ce3446739463b1067cc490210db821769b7a46bd1ff02e1c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_stool_02/metal_stool_02_arm_1k.jpg — 854331 bytes — `dff17b725379af449dae2af9f5224d8b3e863d2dbd645f13d5f4c8b2c9aa1999`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_stool_02/metal_stool_02_diff_1k.jpg — 776056 bytes — `6dd23ca9932da71c37eb537e7d996e1cc7fc8752c566cec0f7e18690c06f07af`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_stool_02/metal_stool_02_nor_gl_1k.jpg — 724830 bytes — `65d0a8be725f094222ca5badf388042d76f24e374398fc0cfb579bc03a29a8c6`
- `polyhaven/painted_wooden_stool@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/painted_wooden_stool/painted_wooden_stool_1k.gltf — 2848 bytes — `f9a9a4a7c38b3421c30dac35d91c41c8864452d6dbb398911494b8324d312ef9`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/painted_wooden_stool/painted_wooden_stool.bin — 23384 bytes — `d336c1eb8832e4441f69bb5618e2289703a7ca71d3884a9087d658051eee0b66`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_stool/painted_wooden_stool_arm_1k.jpg — 751171 bytes — `2088f99a25050d6666348388d279b65993fdd50ad8c14d3419a64f1caea6472d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_stool/painted_wooden_stool_diff_1k.jpg — 607519 bytes — `db0322de5e3c588465d0894515a7c1bdacde9e2a469a9ac154206bfe96746d3f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/painted_wooden_stool/painted_wooden_stool_nor_gl_1k.jpg — 489911 bytes — `39fed6e0a14b464bf5b9555d4ac02df0f85b0bfc89d383e4b8e00c343598384e`
- `polyhaven/old_bed_frame@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/old_bed_frame/old_bed_frame_1k.gltf — 3326 bytes — `661055e76d292ae5ec812f05077a6870414527c2d63947574ea8fc739e16de08`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/old_bed_frame/old_bed_frame.bin — 1864580 bytes — `1dcb3b5d335bd55d9f5a494adb284260042fc663e5c21b9b581a8b301dfffdd3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_bed_frame/old_bed_frame_arm_1k.jpg — 831931 bytes — `c1f265ff346ede024bd869f7aaab9421212ebc9bedd4e0478cf0c2bec9dd315e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_bed_frame/old_bed_frame_diff_1k.jpg — 699001 bytes — `eb9929f07eb43f530562a6ba05d0653f937474ab76e0e5dccea40ec64744a6e0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_bed_frame/old_bed_frame_nor_gl_1k.jpg — 642790 bytes — `4c3d5132ae537a70d30216bb6055273fd00735e13b6c9d5064e0e545227ecba1`
- `polyhaven/vintage_day_bed@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_day_bed/vintage_day_bed_1k.gltf — 2791 bytes — `fb255992b6e651de9709b17c083a14b405e99cbc26774b31bf252e38cf9287fb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_day_bed/vintage_day_bed_arm_1k.jpg — 678880 bytes — `b60e71c345fc1d16396a94a133390b4cdde5c05a38ebaadf2f5dc96be2895b11`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_day_bed/vintage_day_bed_diff_1k.jpg — 807128 bytes — `78b7036a3254c780052b87ac962ac6ba212501821af03c56faa2d7a9ccb955ce`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_day_bed/vintage_day_bed_nor_gl_1k.jpg — 856688 bytes — `2902f47f4778fce0667c2a1dbff7e2e861a0aed475668ea3fce8a485487598eb`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/vintage_day_bed/vintage_day_bed.bin — 80292 bytes — `08172858c3f9d4225780013e4e9afd01bb9db42e17001fc6c790a183227ecf07`
- `polyhaven/Television_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Television_01/Television_01_1k.gltf — 2933 bytes — `ef4376366ea956519c1a1d06146a8e8cc2bb0fcbd5c6b9f919a54ce31d05d530`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/Television_01/Television_01.bin — 90548 bytes — `fc32dd3e6722cfa093910d8b5b4e6173b0c92a13d58b55b8e9c6007a9218b0a0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Television_01/Television_01_arm_1k.jpg — 190774 bytes — `b55594884fec13e47e22d1fdc3c89a528728454f65a7c26b482d9f3ec9200015`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Television_01/Television_01_diff_1k.jpg — 102231 bytes — `38e45263d115ab2832a4a2e99f93f03ff5f49c0aa0d5256528677a77c3ca4568`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Television_01/Television_01_nor_gl_1k.jpg — 144808 bytes — `289519da9f2fa5aeca0246bbb6d42ea1b03e5f54865d8881d3b1e0b3116d300f`
- `polyhaven/television_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/television_02/television_02_1k.gltf — 2767 bytes — `8e7d7cb6bbdb5713b7d4ed21ece7c0f9c41912359c2c0f5065b7e77f5bf4cdcf`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/television_02/television_02.bin — 81668 bytes — `73f1d3519f7bdacca24c892e2614ff756d5d27f5c33fb518cb8aac9154fa710b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/television_02/television_02_arm_1k.jpg — 471183 bytes — `7fa42cc4ce2b2a09e2889aaf7897265a79223cad2f3267e035884c96ab37d48b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/television_02/television_02_diff_1k.jpg — 391490 bytes — `216bc64108a79f3728e4f0fa2927da2491a3c3f5c619c8d48418c2aad84afb5e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/television_02/television_02_nor_gl_1k.jpg — 292847 bytes — `d241001bb67ffe262612ff46930d62f751c425b6e9be8704e762c2dc5b48e536`
- `polyhaven/electric_stove@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/electric_stove/electric_stove_1k.gltf — 31234 bytes — `3be4d1b9ec0ead3c41ea8ef09d61e3b7611b69cbeea26a40ea87355acb0b3c55`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/electric_stove/electric_stove.bin — 462956 bytes — `66f210539346b8f339b7519664ad6fa9b74d0932d8445b6b7e40eabcb40cd4f9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/electric_stove/electric_stove_arm_1k.jpg — 677547 bytes — `8ca9f3f56a8e4ba6f67b6748af09aed2b02bf76c451a71ee962374e52e0b4aa2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/electric_stove/electric_stove_diff_1k.jpg — 446916 bytes — `61bc269714bf37f2bf057c113c17664e224c998c78ea50f1ed85b5d2e6f2e938`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/electric_stove/electric_stove_nor_gl_1k.jpg — 427043 bytes — `66a2f47cd0f218dc4650927e11c169b438251521b4efc556f031aa3a3b57c4f6`
- `polyhaven/portable_generator@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/portable_generator/portable_generator_1k.gltf — 10130 bytes — `d5afe27834f824dfe753391713c45be03479e8100831f320796030531f61b848`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/portable_generator/portable_generator.bin — 939572 bytes — `fb7dcfedec1331ad541569e4ca8d4157284b2164084b7fe5a97928d4abc0ea2d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/portable_generator/portable_generator_arm_1k.jpg — 887711 bytes — `10236e967baddd90ec7d4ab68969b06fb419f98782a2796db94edc0249b0dad2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/portable_generator/portable_generator_diff_1k.jpg — 755079 bytes — `32acc300105a2df2290d872889b24e1b29ff1ca2c56c0a0cf8fbba0c5966a063`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/portable_generator/portable_generator_nor_gl_1k.jpg — 818829 bytes — `8a868edab1a2f5ffa50b2b1680c2c342491b3eeeac443734178c445c7286c25d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/portable_generator/portable_generator_spec_1k.jpg — 23119 bytes — `acf30e81c367898eb846f353d77e404f6831ac23bf071e0e718fddb8881b86cb`
- `polyhaven/cardboard_box_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/cardboard_box_01/cardboard_box_01_1k.gltf — 2903 bytes — `6038bcc5bba5a08a5f6643a265977e37e3d14553e62981e144c33a89f10b78e1`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/cardboard_box_01/cardboard_box_01.bin — 381936 bytes — `7212d43b4cb56459e46d31ab34dc7c310fcfbe170f4a588416dea07ae5628a4b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cardboard_box_01/cardboard_box_01_arm_1k.jpg — 398433 bytes — `5db63828d0f904c6a8d9c83afc912260b2a27261c15a28d06360519384574d2b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cardboard_box_01/cardboard_box_01_diff_1k.jpg — 567741 bytes — `122c7ba8c5935e289804a730b480677a4bffdf74a45c91970cba682df92e171c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cardboard_box_01/cardboard_box_01_nor_gl_1k.jpg — 817424 bytes — `d2d1f529a851966b65411b5094510dd9eba03cd5c0a89921f79325c377a8e8eb`
- `polyhaven/wooden_crate_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_crate_01/wooden_crate_01_1k.gltf — 5612 bytes — `fd9c6073acfc671e12b64666053f2805ae33aff5d3dbbcfe5c97c08c06644927`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_01/wooden_crate_01_arm_1k.jpg — 776699 bytes — `cd0b031c3924905e16ffd78ead062c2cc274148c4104d09635310097738b4679`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_01/wooden_crate_01_diff_1k.jpg — 711292 bytes — `16653f4abaf4c1d9bca94bde3bd8c54d0ea9a5298d1648abcf57de1f7ecc34cc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_01/wooden_crate_01_nor_gl_1k.jpg — 594076 bytes — `f4ea44c7dc1686123d337039cb713d74e8a2dbc6d1bd2beeac276d06f5df3fab`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wooden_crate_01/wooden_crate_01.bin — 189408 bytes — `85f381f8035f7a6f2f3b848640894c6d3333b261946dd8a338c0fe19e0bea21e`
- `polyhaven/wooden_crate_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_crate_02/wooden_crate_02_1k.gltf — 4150 bytes — `e90985d317664668988cb95ce707784c94ab0ccc6d13c980ca789fa69a5cf7b6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_02/wooden_crate_02_arm_1k.jpg — 819577 bytes — `a76af97005a66fe8c7cdcabf20174f06813e6a6d5cd9502157c93a57f3c89d5a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_02/wooden_crate_02_diff_1k.jpg — 716110 bytes — `a6e57123110d2899af9493c22b1918174f1c96c707e7126ac67738d98ee10c07`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_crate_02/wooden_crate_02_nor_gl_1k.jpg — 546319 bytes — `59342f730c9f336950f796ef5e4c3b8c794ce5adbd54d98a2ecb679a7e4ae5e8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wooden_crate_02/wooden_crate_02.bin — 150064 bytes — `e68e272641f704e5241e4108894f0b97363d511944db8b991a48787d0160ea5e`
- `polyhaven/plastic_crate_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/plastic_crate_01/plastic_crate_01_1k.gltf — 2793 bytes — `42556fc8e39e5834ebf474dff79d4c0524fd3074be6c86c0c6704a10be8b3756`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/plastic_crate_01/plastic_crate_01.bin — 789920 bytes — `59b307238a27f304739aeef0b1c9622d1e4efb31a96d805d2cfc0c461f9bb06d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_01/plastic_crate_01_arm_1k.jpg — 993636 bytes — `9a4af28d6fe8d5459a3c1a8706c0f8877221873ac9b83de580e6cfa63c3ecaa0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_01/plastic_crate_01_diff_1k.jpg — 518288 bytes — `d9109a42e397e39bbd7f42976d93122dbd5ccdef8ff64bce353571e1c1b994f6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_01/plastic_crate_01_nor_gl_1k.jpg — 884228 bytes — `6f0c44778216d50672d6a23660b22dec8b96bb6e71518d699c24630c34cf9217`
- `polyhaven/plastic_crate_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/plastic_crate_02/plastic_crate_02_1k.gltf — 2947 bytes — `531f7ba7d4b501759b04fb704db1948bcaab34d8342e71e3f5877d9f0340dba7`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/plastic_crate_02/plastic_crate_02.bin — 186848 bytes — `f51696aa04643b5c1948da88be8ce1d4e92596ae4908b0132cd690f8fb8e0b63`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_02/plastic_crate_02_arm_1k.jpg — 597561 bytes — `f0c667358c7afd46be37b40c30435b63ae3dba8432b45c507f3298fc6f163418`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_02/plastic_crate_02_diff_1k.jpg — 492862 bytes — `f153478d5f44f39ab27a967850caac27b35ee8f04185d0d4eaf7ad501742fb15`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_crate_02/plastic_crate_02_nor_gl_1k.jpg — 558561 bytes — `492b4cb03b043fb30a21b5de1cdf91dfbcd9bb7d080957af69a333d622050f30`
- `polyhaven/wooden_military_crate@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_military_crate/wooden_military_crate_1k.gltf — 6002 bytes — `e8d8d21d112fef04c8e9fd05a62dc7c94260bc230a43d86d0e1f4b5a888a9499`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_military_crate/wooden_military_crate_arm_1k.jpg — 782386 bytes — `fe27fa628a9134f81958413c1a11deea8074fe40424c1a8a48ec459f2dde7955`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_military_crate/wooden_military_crate_diff_1k.jpg — 824093 bytes — `aa6ace45bef9947586c07283cd11a2d737fe0783a18df69a76f77f59d4fb776d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_military_crate/wooden_military_crate_nor_gl_1k.jpg — 745490 bytes — `89cc5ad94dd7ce425f2b9b04f37f2266778923369c77d8945101456f47579cf3`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/wooden_military_crate/wooden_military_crate.bin — 687548 bytes — `cf6fd469a476d834f9724f8b8f762630040d8e785e8697c5d7994ae3e840e727`
- `polyhaven/old_military_crate@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/old_military_crate/old_military_crate_1k.gltf — 10126 bytes — `ef4b69dca61542c4d724c4807233161129150220695742b5137ed65d8d2e1f24`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/old_military_crate/old_military_crate.bin — 329004 bytes — `80eb5ad690aaa6f4f401df0f8e323666bf8f3f9943c7cb703eb37002f5084ce1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_military_crate/old_military_crate_arm_1k.jpg — 704105 bytes — `7b3a94f18f15783d9940fe4bd25316e8daffd0bdcbdfbe3e234b3cbb636bf5da`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_military_crate/old_military_crate_diff_1k.jpg — 709506 bytes — `9e74a72787364fee09a450e442db97a687d237051e98f8ed709af516434e895d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/old_military_crate/old_military_crate_nor_gl_1k.jpg — 742682 bytes — `88935171626be79c4a44d0c52a33bc8d88b7b232ae48157d639a9ada0ab6e92b`
- `polyhaven/metal_toolbox@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_toolbox/metal_toolbox_1k.gltf — 10717 bytes — `9b8d240f1e41e83119771a063e4f4b4bb9ddfefd47f9f5baeda998107aa135c5`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/metal_toolbox/metal_toolbox.bin — 468892 bytes — `fe5551028e5b398c78c86911abf549010f83831c30b01593ca3eb3d8ba7ceae7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_toolbox/metal_toolbox_arm_1k.jpg — 1033149 bytes — `97676b2324b105b710904b20bfdeb32bfce3c6b4ccaaf215827b37961fc22763`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_toolbox/metal_toolbox_diff_1k.jpg — 661804 bytes — `21e1d21880e49db3fde0457d53b78a70db61234a201da9f0181dd0880b110473`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_toolbox/metal_toolbox_nor_gl_1k.jpg — 572273 bytes — `7ba19a233bcfff9c3d95b62c3a992c8e19cb2d6355c98d6e12bdc756a8af44cf`
- `polyhaven/Barrel_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Barrel_01/Barrel_01_1k.gltf — 2711 bytes — `e084945dedd6a3379c6f3e97842cac89df7169797707e123a5e5b42c135d6888`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/Barrel_01/Barrel_01.bin — 81756 bytes — `fe8369c1ac796059b62a091c0db7367dc420aa2cee212672e48f991f4208da98`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_01/Barrel_01_explosive_arm_1k.jpg — 243594 bytes — `eab507df7719f0e7a3615bd22bb7bc0c09fed83bfc44e72a51451f8069c2d374`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_01/Barrel_01_explosive_diff_1k.jpg — 179308 bytes — `a7e5a7b03bbe0c9c56bf1ac09b24121a5d19148428e9e6eac326c803fc297098`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_01/Barrel_01_explosive_nor_gl_1k.jpg — 185578 bytes — `fa4750d64c6f568c8de3e36bc631348710329cf2d6d9c8c87bd2e47a96bc4fcb`
- `polyhaven/Barrel_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/Barrel_02/Barrel_02_1k.gltf — 2639 bytes — `82204368af4d7211c440e7ebcd30979f48ba349d4439f3bf0212f86d4ba5d9d8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/Barrel_02/Barrel_02.bin — 77440 bytes — `a9a848743a7616710e2b3aee0b61c6fb69abc3910a150856ad21776a6089f29a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_02/Barrel_02_arm_1k.jpg — 166615 bytes — `bd69aa2c5c069482cb48a14aed1f3a1d079bd868d865247206427df5a53202e3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_02/Barrel_02_diff_1k.jpg — 74005 bytes — `2dd828ce25b5b6b0ffc9b7901d1778767f1897be1c8004f4ec047fc91742cf12`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/Barrel_02/Barrel_02_nor_gl_1k.jpg — 100819 bytes — `f7029669d04979d20bbe1a80d34e689aff4b1ebe1bcc37a3ee62c8e384229a77`
- `polyhaven/barrel_03@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/barrel_03/barrel_03_1k.gltf — 2638 bytes — `80e2faf48b7423bb522b573e459d99c5656a16763285ec8268e957fc7d41f9b8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/barrel_03/barrel_03.bin — 44872 bytes — `10f3202e9ac9acf8dd896f1562c64db58311ffef89efb402d8433e03ad486427`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_03/barrel_03_arm_1k.jpg — 249922 bytes — `2cec2338b36d7322bef55e6a1d0884b223c5ed383cf986a58bfa461478c64c7e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_03/barrel_03_diff_1k.jpg — 149997 bytes — `62feb27dfa9a0daf3f323fdc1ddc2d8e4a5996cf2c72fe50197b55c2b9cba7f3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_03/barrel_03_nor_gl_1k.jpg — 126707 bytes — `ade97c52985047858a4f38226a9b8a888e3a766ba0434700b4618fb25424c4b6`
- `polyhaven/metal_jerrycan@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_jerrycan/metal_jerrycan_1k.gltf — 2793 bytes — `7ae6f2aa0b7f35e38baa89c1c243312848391a9d1c0e67acf02aa7dac32599ff`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_jerrycan/metal_jerrycan.bin — 484676 bytes — `d84ce2528b28a477c5309fc289a50a3deb61287265a787bd728e639c5230408c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan/metal_jerrycan_arm_1k.jpg — 988166 bytes — `fda20dd47d809fd5bd4cd29cd11e77fc2de97bd35569a7efb51fbf78705e659c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan/metal_jerrycan_diff_1k.jpg — 673499 bytes — `64781939c4b3f739c52c335d26473def75d736173f3cc11a50ac2876d511d123`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan/metal_jerrycan_nor_gl_1k.jpg — 885424 bytes — `88dd8f6566cc5faa8fee658777115b518642508f23ffa1917128dba9539ae14d`
- `polyhaven/metal_jerrycan_green@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_jerrycan_green/metal_jerrycan_green_1k.gltf — 9539 bytes — `7c63c43f9042a08fff0cec69d1d954d029cc10d2546ba63072fcf719d5db49c5`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_jerrycan_green/metal_jerrycan_green.bin — 273368 bytes — `386534027d20514402c05d68115f4bff7b466db0b02022f9ab51ac6a576bb3fa`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan_green/metal_jerrycan_green_arm_1k.jpg — 1050155 bytes — `5012d95478dc0818e9ad883eee6f4ce5d99523cc190d3c6543c0b5750d954239`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan_green/metal_jerrycan_green_diff_1k.jpg — 577269 bytes — `422b63d79fd360a5d016b75ae110917da64ce682c9e1e97c73ac441a000652e9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_jerrycan_green/metal_jerrycan_green_nor_gl_1k.jpg — 744758 bytes — `7af3a6bb717b13cfafaad5b933b40484983a57b3806992b1b349d2fa77eadb6c`
- `polyhaven/plastic_jerrycan@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/plastic_jerrycan/plastic_jerrycan_1k.gltf — 2812 bytes — `c173eac3ec21c955948fcde523ccf7baeecb90b4fd01e6971edd1ed8ea786342`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/plastic_jerrycan/plastic_jerrycan.bin — 209304 bytes — `d60c292e0962baabb350b1107c1142e711765a9e76141a6fae52bdc36b24831f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_jerrycan/plastic_jerrycan_arm_1k.jpg — 977009 bytes — `dd23cdb12c6c1524bdddf9ea7863957062a3398a6ea68a8fad784866e26da9f8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_jerrycan/plastic_jerrycan_diff_1k.jpg — 670067 bytes — `7b37ad8d4d24844fd9a53f1684cb99772aa8a93b3be1e09af8e83a9528c785f0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/plastic_jerrycan/plastic_jerrycan_nor_gl_1k.jpg — 647099 bytes — `e23c53dfd3182cfa83a819f47260374ce3bf2deeb3a88d42f268927187e3bf56`
- `polyhaven/wooden_bucket_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_bucket_02/wooden_bucket_02_1k.gltf — 5625 bytes — `9ced8ec4849e59e7135d1ab342dbb106adc8c927d2178b1643f1089f19d548b5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bucket_02/wooden_bucket_02_arm_1k.jpg — 875674 bytes — `4873fc1f3cda8a0e49f254861b1a6761bc9d8f192509e7f9b2163fdc84d7e86d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bucket_02/wooden_bucket_02_diff_1k.jpg — 648386 bytes — `473693e53010cf87e0800037c39d8a5843351888b907c213e775bf1c10aac559`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_bucket_02/wooden_bucket_02_nor_gl_1k.jpg — 756137 bytes — `206d606d5ce5d27fcc13e5a0c34e338d7841f6f26a3dd3f3a4f9d45644da45be`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wooden_bucket_02/wooden_bucket_02.bin — 227128 bytes — `d733864312ab54d3d7908b930e858acde4eabe332ea742e0d1d15097c09aab93`
- `polyhaven/wicker_basket_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wicker_basket_01/wicker_basket_01_1k.gltf — 2792 bytes — `9ad86c33f00f46a18c9bc8bfc28c0036090ee819f7270d0028ec408512c04094`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wicker_basket_01/wicker_basket_01_arm_1k.jpg — 874111 bytes — `5150638cbcd8f1bc07b76af3b60b31a4c5e7d38ce66ac8906b9c3192f3283b9a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wicker_basket_01/wicker_basket_01_diff_1k.jpg — 679110 bytes — `15156c7855d5642f6bb594edfad5bcdcfe11f87f3e109956cb9e8fdb15fef921`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wicker_basket_01/wicker_basket_01_nor_gl_1k.jpg — 549218 bytes — `d06024a37ef330d05bf128b8488f72769af05e72d266ffbc810d7f09ea2b32f9`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/wicker_basket_01/wicker_basket_01.bin — 624920 bytes — `8e96025ffcdc64a7e75d1aa980f2491b1219912a4554272cd1e192a966c399f8`
- `polyhaven/potted_plant_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/potted_plant_01/potted_plant_01_1k.gltf — 7969 bytes — `23b30294407684b02f14800d6685bd8938da5d2111e17753ac8dd3c37d8c88a0`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/potted_plant_01/potted_plant_01.bin — 5345188 bytes — `a8dd1f7ce75f50dc25bbedc20809da02ee4193815c155b883a329925fa5548f7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_leaves_diff_1k.jpg — 124730 bytes — `b73891a0a606e139d0fcdd9e6fe503cd1210be3fc9c55fbd033941288231ccaa`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_leaves_nor_gl_1k.jpg — 177105 bytes — `2faa756e0ee2b8341c752b283b93599157bf56f4083a9f61b825cdfa0c7138ff`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_leaves_rough_1k.jpg — 91706 bytes — `765e3bd1bfdad39dd0d1cd755eafd1f9f1d46cbbb6013988cbfd1197de27a1f9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_pot_diff_1k.jpg — 204900 bytes — `51c9d80e8abe585bd3dbcebe7cba1d3ed1a22b137c7cb66baf0e462c08dca312`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_pot_nor_gl_1k.jpg — 200349 bytes — `ec02e51751e0822d229d48bea1373b06e2675c3725ff04fd1f87ac516719e620`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_01/potted_plant_01_pot_rough_1k.jpg — 173192 bytes — `1256199fe3a88a0534bcd4c8bf141cfa9a28b68fce3f286193d0713796fd8561`
- `polyhaven/potted_plant_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/potted_plant_02/potted_plant_02_1k.gltf — 6653 bytes — `c533dcce0d1aa4379eb7db04601a04983f8df2422b28578de922655a416e64a9`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/potted_plant_02/potted_plant_02.bin — 1852244 bytes — `9c9812482c78a59789ed32fa842b4cbd9365e09c900c31ebb998e5efe627fe97`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_diff_1k.jpg — 167700 bytes — `3643dce6e6c0a9f40129bd837ec1a11802e8f43ea43cb29e58219d82e0ac632b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_nor_gl_1k.jpg — 127232 bytes — `e0fe090ff7a511729c9bbe59df7288b400430fdab178529443dec75e0f06007d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_leaves_rough_1k.jpg — 102396 bytes — `ac8959f70c0e91e77f3cd6fd3f73578b8aed64ac6c33fc34ac027a4e88276960`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_pot_diff_1k.jpg — 155244 bytes — `684949bf24821d7e951d46915366b5a388d2e4ccaaa9d5284e718c83604705e9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_pot_nor_gl_1k.jpg — 108343 bytes — `981a68721c8b7b9ac26b96d0210334599d5e8f529362f505082c071a0a58e86c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_02/potted_plant_02_pot_rough_1k.jpg — 114886 bytes — `4e92ad8ee0f098050785d9a025e2c5a7d55bc7a7f7e1916cc7627fc7824a938f`
- `polyhaven/potted_plant_04@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/potted_plant_04/potted_plant_04_1k.gltf — 7081 bytes — `b3a3bc3e97da75844999c4da07b7104b6c023f729a7c045979929b9504184339`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/potted_plant_04/potted_plant_04.bin — 241800 bytes — `158c1d27503d4845eb3573f00c01ae3f4f77f1d6ca8754c67bf1762745946f7f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_04/potted_plant_04_arm_1k.jpg — 478413 bytes — `7f3288345570ef700c851ea382ed267490ffc8c901ccc31f2ec5507e4d098e48`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_04/potted_plant_04_diff_1k.jpg — 577545 bytes — `8693a971557fbafb12a24a2e23c1a04ab6b04ecdc4d26808c5ad3516a4971f24`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/potted_plant_04/potted_plant_04_nor_gl_1k.jpg — 817786 bytes — `66e4627f6691a2d8104a6c53a39b41daddbd5bad8103e73f372c39166a3dcb07`
- `polyhaven/planter_box_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/planter_box_01/planter_box_01_1k.gltf — 2787 bytes — `15c7ff7396d872e5cad6743c796ff0f42e1f3f831fd334a26aa1fdbd11834a1f`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/planter_box_01/planter_box_01.bin — 250580 bytes — `cc97bc9ee05a90c78e27ca575a83eba86955e863dea8a12826f6ff02c2c11db3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_01/planter_box_01_arm_1k.jpg — 745610 bytes — `b80b08f88166360af32a076082daaed820f0d364a5bef0acea651485017ccbd6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_01/planter_box_01_diff_1k.jpg — 633117 bytes — `5ad77068bf07ca371e18322c04641754a7758f4479e2835b93f671b4a5143bee`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_01/planter_box_01_nor_gl_1k.jpg — 707323 bytes — `7d2ad01fdfc8ea9e39af0ddc1db710380afad859dc3848302ff72d21a6e21a27`
- `polyhaven/planter_box_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/planter_box_02/planter_box_02_1k.gltf — 2787 bytes — `9ae29e813136cb056c672edbc5833ff5af2042b3cd15abc652e9d3fc338dca71`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/planter_box_02/planter_box_02.bin — 359296 bytes — `eedaf12238996e02f5aa8e44515ec8746cc1bac19cb3480a5914a7b4ea20dcda`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_02/planter_box_02_arm_1k.jpg — 750404 bytes — `dcb9a181bd084811fdecb3412b5cb5167d9acedda53eb2eae50455e0b4b63b40`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_02/planter_box_02_diff_1k.jpg — 620574 bytes — `0500b512d922e2dc311fb4d1bd23dd982732f1ed2d79264f608487e69ef193c1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_02/planter_box_02_nor_gl_1k.jpg — 735299 bytes — `c55e6d9db96b71cf4c863735927a80c0a3e4fed1c48229b386e8e1d29af8da58`
- `polyhaven/planter_box_03@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/planter_box_03/planter_box_03_1k.gltf — 2790 bytes — `56a1a36abdfcbdec20e379392c0c3d5d9ba0fff1003cf8f3858fdb58ef9ba9e5`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/planter_box_03/planter_box_03.bin — 420144 bytes — `ef816549229850ba3015ca8df20c8df6a076c594575d4dc4d952e71e518fd70d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_03/planter_box_03_arm_1k.jpg — 743133 bytes — `dcb2eb57ee82838bcd9c65227b2780dbdc1d1f33aa7ec00a198130344334385d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_03/planter_box_03_diff_1k.jpg — 643298 bytes — `0cb9ed4e292860bce7f1fcb65820f8292d331d5b654ac09904028c149b5bb4a0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_box_03/planter_box_03_nor_gl_1k.jpg — 749007 bytes — `1c27f3533f68d6680d756e2a02fb01e052219d47a299b86d2c71be8f3443ac68`
- `polyhaven/planter_pot_clay@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/planter_pot_clay/planter_pot_clay_1k.gltf — 2813 bytes — `f2989068dcff9737c9f3d49d435b70e36d553822ac87134daac055ae9706af1e`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/planter_pot_clay/planter_pot_clay.bin — 78096 bytes — `effd0a038a75a054e55e2f5f71a84c57c1c6efc4e453ae3e62d4ce5167a2913c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_pot_clay/planter_pot_clay_arm_1k.jpg — 613484 bytes — `68e9e509db4e330b48924c606d4a9a99b54e105c1fe1690ff2811a05d95a0def`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_pot_clay/planter_pot_clay_diff_1k.jpg — 596319 bytes — `4f2962fd238401e49fd400596fdccd1ee9e2cca9ed21e44bb924dca3076f524c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/planter_pot_clay/planter_pot_clay_nor_gl_1k.jpg — 506446 bytes — `25a564e55b247a94863b513853b1aeaad5c894dd78e92e1fd89e794b83b483c4`
- `polyhaven/tool_cart@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/tool_cart/tool_cart_1k.gltf — 2744 bytes — `ba4290f62b37dc08d4f99da2b3c78d8cb584bd229e8805ce586ed3f3b5303759`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tool_cart/tool_cart_arm_1k.jpg — 744873 bytes — `2b928779ab242468c90e6074ab72567bc58ecf3e0240fd709e4507b59764aef7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tool_cart/tool_cart_diff_1k.jpg — 711555 bytes — `3a3e18efa54d18f2d01ad51cb40f8edd9af76e054a6a9c21324bc14fe49be965`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/tool_cart/tool_cart_nor_gl_1k.jpg — 817628 bytes — `fa995e77eacad81c78f650e28a6d4c1c7b9d6c74a3f314d5f5ebdddf6de510fc`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/tool_cart/tool_cart.bin — 895660 bytes — `3962637a4faec733b10d9970bfeea6696a48b6fd361fda085cc3d122138f6aaa`
- `polyhaven/metal_tool_chest@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_tool_chest/metal_tool_chest_1k.gltf — 12256 bytes — `2f66fbb723cd52382f73daec184b68d9b36842a488ecaf120e5c3a6354e9dea4`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_tool_chest/metal_tool_chest.bin — 434496 bytes — `c2bde4e96af4aad171e57e00ff78f0aa9e3b603286a2c74cd6d7c2a20c487342`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_tool_chest/metal_tool_chest_arm_1k.jpg — 755794 bytes — `d5552ee63ac9bc53527ee1bf19bcbd31d8424bcc15fe9861f79bba917e857828`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_tool_chest/metal_tool_chest_diff_1k.jpg — 552016 bytes — `da37ba2a8d064637c7206cb091597275986e788ce379bee58a96c949cce06511`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_tool_chest/metal_tool_chest_nor_gl_1k.jpg — 604781 bytes — `bc5a4009a544a9504849b951afd984d6ac7c5adb0d43c5a08c0a834f8e811a01`
- `polyhaven/industrial_storage_cart@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/industrial_storage_cart/industrial_storage_cart_1k.gltf — 2878 bytes — `f420b66b2e56513542b9598f038eb5f5ce120746735997807e58552049884043`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/industrial_storage_cart/industrial_storage_cart.bin — 664580 bytes — `ae46bc3aceda8234515054b3b4595db14e7eb72148100b5c2cafe1de7393410c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_storage_cart/industrial_storage_cart_arm_1k.jpg — 849352 bytes — `956ee8d02021aba0b5fdbf393029b0aaabd7d29076caa3a5678e394f79adcca1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_storage_cart/industrial_storage_cart_diff_1k.jpg — 553691 bytes — `7e779d7f7385307ebb332aec41bafff10c21972aaf92382f30cacb16957e7d37`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_storage_cart/industrial_storage_cart_nor_gl_1k.jpg — 567119 bytes — `a4fcd4309516e6005b5f3636399bd801df72fc75986831fad9cc5c31b737070a`
- `polyhaven/vintage_microwave@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_microwave/vintage_microwave_1k.gltf — 4727 bytes — `d44f101ca3826e4ae4976bc4de96f31f15ea00f95775e41dc1eaf54aa598c8e0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_microwave/vintage_microwave_arm_1k.jpg — 589054 bytes — `740abbcdda87c94e5bc2f40e3c9e8f7798e4ca6ca44ecd70f20c2c5b503f1ee0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_microwave/vintage_microwave_diff_1k.jpg — 489267 bytes — `09a23468f70a41b16a3ae97b53940ff4178f5466a6e3a4ad4dfea416ed6691de`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_microwave/vintage_microwave_nor_gl_1k.jpg — 312615 bytes — `9fd35346f2a6afa85d07c0904a3a8337dababb7347ee3c207e9243303e437b8c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/vintage_microwave/vintage_microwave.bin — 237296 bytes — `f09ab1eb99ca23e7a3496ead7372de9281018c11ae5b2e9eb50f1d06f2bfe4a3`
- `polyhaven/boombox@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/boombox/boombox_1k.gltf — 4656 bytes — `8f5851b81d0d0b16fadf9ca89133b59ee48718ed8d9f8244b87e4d293755d2d3`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/boombox/boombox.bin — 328752 bytes — `2579a18ff22b3c3466cd557ce3e4bbe517091bb7158172bdf9371ca993f9c49f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/boombox/boombox_arm_1k.jpg — 415692 bytes — `8fa0c9a71c2606a9acea192763adc733298267243a3abae75c75a2477f42cbf6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/boombox/boombox_diff_1k.jpg — 471435 bytes — `8ad03125524ecc218810f2b100dc047958184b3e98c6c2d89854fd7ec88be981`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/boombox/boombox_nor_gl_1k.jpg — 491377 bytes — `684211254308ea8c8235852dc93b5c22dc80f62f2acfa83f71cf083076ab00cd`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/boombox/boombox_speakers_arm_1k.jpg — 717847 bytes — `00d7de33b77f5c8f7386679dfcc9daad3f5ca124ced0021f641ecb6739364443`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/boombox/boombox_speakers_diff_1k.jpg — 638537 bytes — `4240a5bbbed85dab19e10c753aa6022a9d5e8d3d1c3ff05620b8e62459dcd1b3`
- `polyhaven/vintage_radio_transceiver@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_radio_transceiver/vintage_radio_transceiver_1k.gltf — 25848 bytes — `556b668305968576b00d9f809070cb6b193b62d30c39e46b8c05cc34911757c3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_accessories_arm_1k.jpg — 932225 bytes — `c3aa2b5f4bfe0fbc7409556b400b2159edb14d6b77cd14e501c6b875144db362`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_accessories_diff_1k.jpg — 739039 bytes — `54b544c6fd2e478ae75e1e5ac0361d95c423b6be393819e6df8965e119d53c3a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_accessories_nor_gl_1k.jpg — 591038 bytes — `0d64ee0718c78f49ad5ef9a13c4eddb92afa9a9dd0f52da1c5bd5778e1367d6b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_arm_1k.jpg — 943816 bytes — `86e404440f9ccea0d6d554810bb5d98d4d7c6052271a97c82180238f1d0b6450`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_diff_1k.jpg — 754292 bytes — `a730d1fa041bdead966ed04d501638de839ebde0163a64becac2132d9268bfe6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_radio_transceiver/vintage_radio_transceiver_nor_gl_1k.jpg — 575198 bytes — `2f8136500d3a82cdab92efb12f6871656b4f6f920aa85f639156ba22c97b2ce4`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/vintage_radio_transceiver/vintage_radio_transceiver.bin — 1740024 bytes — `392976de8f78517141a42c8a4685463c8db508d3ce4ac04e7235d6a5374c0de1`
- `polyhaven/CashRegister_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/CashRegister_01/CashRegister_01_1k.gltf — 6300 bytes — `323992ca49ac5527e62029ec8e554d2bd74b618784209b5abdf2abf50b941559`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/CashRegister_01/CashRegister_01.bin — 356396 bytes — `51cfd1329ae1700faaf4d1ce6116f73e795b6a31af7e86fbbb1047b57aa0fe3f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_arm_1k.jpg — 207527 bytes — `b2d66b5fcb70ebba6803265936302889fe9d952dca904fb4a8dcd8d884af6d53`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_diff_1k.jpg — 133109 bytes — `0f048e68054f480d773a6d997a5a853610fde80ecb5bae1c3994ed434c02ce84`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_glass_arm_1k.jpg — 72642 bytes — `bba4ed60cc9cf3df8862fc4ce6ed18d911013545b0928f3f8c20319819c14497`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_glass_diff_1k.jpg — 99676 bytes — `25607764f4956a2c59657b0eb4384a1623040ff7fa55acf18d69b2d6facfc1ec`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_glass_nor_gl_1k.jpg — 17077 bytes — `312e24f0f5d025a82bfb2fbc989ac239099ff8b4c46d3cd0125f07da18bd228a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/CashRegister_01/CashRegister_01_nor_gl_1k.jpg — 146745 bytes — `80e75c35d47e2eb4910932866e66e921d38cd8fc88753eaca4b70f86252c8638`
- `polyhaven/vintage_electric_kettle@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/vintage_electric_kettle/vintage_electric_kettle_1k.gltf — 4801 bytes — `c03d2ef0e9f46eb06a1ccef6ff78d7baf83e76808e31d7016505e3ee0a416859`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_electric_kettle/vintage_electric_kettle_arm_1k.jpg — 756927 bytes — `ff683e24348d6319edf7bd5a14659a846d3008ae614bf966d4db23fc156b5e0c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_electric_kettle/vintage_electric_kettle_diff_1k.jpg — 584337 bytes — `eee3052a610f24055f7b25749cfaf64016a5621afcff931fe513ab62c0a829f3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/vintage_electric_kettle/vintage_electric_kettle_nor_gl_1k.jpg — 624432 bytes — `7723e22b77b73c6cc20d2593849d56cc64ee5c8e54bacf3bf8b2f4dd4f2ffaf0`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/vintage_electric_kettle/vintage_electric_kettle.bin — 416612 bytes — `6be39ebc1893feaef3aa05bec6d2bf069af65fec0c1500422aaedf14357dab59`
- `polyhaven/classic_laptop@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/classic_laptop/classic_laptop_1k.gltf — 7496 bytes — `c78867ed92356fe03fd90b56438f3b141b5f8654672da52c6df7868eb820cf78`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/classic_laptop/classic_laptop.bin — 508524 bytes — `0f1602f2fe856fd330e95df44af0fd9986aeac873343307c70e036041e789fb9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/classic_laptop/classic_laptop_arm_1k.jpg — 697150 bytes — `e7d74932e0d40bf91fa9ef11f441cc94d9597b5c72721572b49b03109d0fe171`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/classic_laptop/classic_laptop_diff_1k.jpg — 524918 bytes — `0b0d4a2a991f8ee45effdb0c038af7348c6c731bc9a251e09095abde6cd34974`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/classic_laptop/classic_laptop_nor_gl_1k.jpg — 445971 bytes — `9e47604dc75d7ffe4f1e2265b76f9b5c4cb1c7e98d72e16e4656fecc44e5d1dd`
- `polyhaven/cassette_player@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/cassette_player/cassette_player_1k.gltf — 7549 bytes — `3501d41d15249c78d0dec2adf6518b3bdfe691ca24b16d0f0c1f0f0ca57824e8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/cassette_player/cassette_player.bin — 147476 bytes — `5ebf8d2361d54fa9640b50c28f38a516135a39e0030e513a8cd3fd3096b335f8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_body_arm_1k.jpg — 180349 bytes — `2bfc0ee4521354c8bb8ea6a132dec90d6e4ff2425c7a6ac71d6ecfe24ac6a941`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_body_diff_1k.jpg — 92420 bytes — `2ba804ff09613f4e4fda13e0c5fa0aba6bb0d771febe093c60623f53149c4061`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_body_nor_gl_1k.jpg — 138542 bytes — `1fad4388095f157a57f47b02788f24e75bd7eef236ffb3c8d07632e073079d63`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_tape_arm_1k.jpg — 102646 bytes — `ac1c67cc2871ff3ffb3d31d673dc2707723822674fd587f48070c5536dca66e3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_tape_nor_gl_1k.jpg — 119871 bytes — `99a5c90fdc8d3bfa8c73f506d51a2ed047bc12322f2e3239b8bf33a261007d6f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/cassette_player/cassette_player_tape_orangeblue_diff_1k.jpg — 155829 bytes — `17dc2f98a700e2e2e6e753c148aff10d5e7ec792fbc5b75aaeaab8a55810b5ae`
- `polyhaven/desk_lamp_arm_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/desk_lamp_arm_01/desk_lamp_arm_01_1k.gltf — 4453 bytes — `2ac8389afc1519449a9cfdf7efd9fa36780a2177bb47ab58f7a7dda7d247dc8c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/desk_lamp_arm_01/desk_lamp_arm_01.bin — 736804 bytes — `07f34e32abecbaa63d28b9d12d6a0eb82b775a0f50c92327655909d72ff8489b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/desk_lamp_arm_01/desk_lamp_arm_01_arm_1k.jpg — 780379 bytes — `206404c79fb7dcf8e2c4558c13544342f87d2190526231a1750c3c9adc256fbc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/desk_lamp_arm_01/desk_lamp_arm_01_diff_1k.jpg — 702522 bytes — `159eb178aba3271bd555cbe07ca36431d8af9a006f0b8e9d8c67030cbdc9e4d3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/desk_lamp_arm_01/desk_lamp_arm_01_nor_gl_1k.jpg — 651826 bytes — `feefedc3835ecef3634e97a24977451671f8f57747a023f48cd14c84bc73513a`
- `polyhaven/modern_ceiling_lamp_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/modern_ceiling_lamp_01/modern_ceiling_lamp_01_1k.gltf — 6177 bytes — `f88b5d0a81fa813457a77474e7e4e812f97ad5fac2109ba03ddb183274be3f8c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/modern_ceiling_lamp_01/modern_ceiling_lamp_01.bin — 146828 bytes — `ae5140a64e12e639554158901a5e92340bb37c706096ff255804e3220fb96367`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_ceiling_lamp_01/modern_ceiling_lamp_01_arm_1k.jpg — 124022 bytes — `f4c6a8e7c86b1deaaf0f74099539ff635063b63f594b0fadfc3ec8fac805df4e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_ceiling_lamp_01/modern_ceiling_lamp_01_diff_1k.jpg — 79705 bytes — `c08bfbf7576a86a4a09d386ae9f0a92965fc652bf82f3a8dba1c796b1aa9e535`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/modern_ceiling_lamp_01/modern_ceiling_lamp_01_nor_gl_1k.jpg — 79333 bytes — `dd75bd21a901581325f5c363bd89b45430b8531cb27dead314cd087196a33c27`
- `polyhaven/industrial_wall_lamp@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/industrial_wall_lamp/industrial_wall_lamp_1k.gltf — 5800 bytes — `5a2c0d8bdb52fe168727f4200818ac0c2adbded32f0b9dc09cfe224249f9e266`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/industrial_wall_lamp/industrial_wall_lamp.bin — 141492 bytes — `d0a6a08b5e2e83ff8d6eb61bb5daa74654b4ff8d9c634348c87f83dbda4837a2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_arm_1k.jpg — 753080 bytes — `70adef2921bfcf985f951f9f85fca8dbfb63dc84535613c3872684fea65ab025`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_diff_1k.jpg — 669629 bytes — `e0f824b7e639fceb7ca5b7b7f67a8168bc53db184b818770126167d16d424b2e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_emissive_1k.jpg — 62349 bytes — `cf80eeeb6fec87499fb8444f554eae62e471ad79f8906d6fd693d7fde53b012f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_glass_arm_1k.jpg — 570850 bytes — `a3ba7f76ff395ada04a804b94f4f2f506bc994336189916d2a414173e2360069`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_glass_diff_1k.jpg — 316099 bytes — `215457a5d41ae5d999e94f4ea0f424ff769940e71e1449ce712f35687e33af67`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_glass_nor_gl_1k.jpg — 585913 bytes — `73ce4f34d90aee29db9a5e301934c0642bf89136353d7e400f63db1c2f99f345`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/industrial_wall_lamp/industrial_wall_lamp_nor_gl_1k.jpg — 673018 bytes — `427bafa2f14d9f81a5949507d5d6915bfb4b70a8e5e5076a3a18c7de49b3d78b`
- `polyhaven/dartboard@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/dartboard/dartboard_1k.gltf — 2732 bytes — `8535a0c0a954bd6db863f975ef9f6ae9dea27d43a2371fb8484cf40bc0e4e7b9`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/dartboard/dartboard.bin — 181888 bytes — `8895fbce41d05825c91981c97fa8633104aba494cb7b58ace25428c3a962215e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dartboard/dartboard_arm_1k.jpg — 950947 bytes — `e273c427f8017d6e1e0e0a729b867e036839bd58f547c391008214641d524a2a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dartboard/dartboard_diff_1k.jpg — 797104 bytes — `0aba52ac48fb10ba3a15c67726e52113855b072216f5cb328d5a18614505685e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/dartboard/dartboard_nor_gl_1k.jpg — 1098585 bytes — `4996289474316cd42e72682b5039a2f66f7d2baee05209aeae32d23c1b9c5dbe`
- `polyhaven/hanging_picture_frame_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/hanging_picture_frame_01/hanging_picture_frame_01_1k.gltf — 6495 bytes — `00aaeab14751485287443b4c5cc2ee5673136510595daa6a2948519c116ad47b`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/hanging_picture_frame_01/hanging_picture_frame_01.bin — 86448 bytes — `27ec66baf3b227d004d2d325e18c77df6b7a1a7f74afd7d5dbd4f950bc2f5ca6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_arm_1k.jpg — 101751 bytes — `aec54462e91d53610f46b2bb760cbdf453e7b87c5193efa24f995cd5bb0253bc`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_artwork_diff_1k.jpg — 44185 bytes — `2e177d2061d2204efc2a1285dc0a30220148b41134d331ed93fd21ae8b15f6a0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_artwork_nor_gl_1k.jpg — 17259 bytes — `f91caa0cacbefa2c30dff935f0aee41e5f7493f6ba881e5a5021b8a220084195`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_artwork_roughness_1k.jpg — 12684 bytes — `62d875e9427f5d71f1bb4d9dc9569e34465bfd3067b8b13f5644b73e23a09fa3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_diff_1k.jpg — 88363 bytes — `a6aa51141299ff7366b6e1ac1496dee2d8bd2d6fe775ea7d1fbbb299b2afb5e8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_01/hanging_picture_frame_01_nor_gl_1k.jpg — 40281 bytes — `6f16f93ee6fcffb27dbd5ebf3de8fda71c77c7e1abd61ae9261715029be4d43e`
- `polyhaven/hanging_picture_frame_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/hanging_picture_frame_02/hanging_picture_frame_02_1k.gltf — 6433 bytes — `ea9a1d44e8d794e224a5342204669a328b57d64d5df629d1d5d86e60e27245e5`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/hanging_picture_frame_02/hanging_picture_frame_02.bin — 115080 bytes — `0ed5813c8b30f63807ffac962e47135d3248b3804e07cb93862c13e29bed83d8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_arm_1k.jpg — 113780 bytes — `67378630bc6bb69799f8ee0fde4ab11ecd9e7a43ed3dfef402fdd784d8c2cea3`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_artwork_diff_1k.jpg — 138383 bytes — `7e26aee962965fb201975ef5a99e2751a24c4b461b48e8348cea9f31cde027c2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_artwork_nor_gl_1k.jpg — 45035 bytes — `8a700c0d7d3f464177ead95879d60a8bf43ef77c034881379b2c036406ab9e27`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_artwork_roughness_1k.jpg — 74142 bytes — `305018ab800cbd02d61c08f9c5a422c2777f2b5cbb20579f671be56a1fb21853`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_diff_1k.jpg — 146402 bytes — `575f2b6481b9e02474750ded776a0b490744228cb64d9b346f28bd78b9cf5897`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/hanging_picture_frame_02/hanging_picture_frame_02_nor_gl_1k.jpg — 56776 bytes — `79367cf9d7e4981263dd1439297585148d6c93500acaffa7afeb534351e68b86`
- `polyhaven/wall_clock@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wall_clock/wall_clock_1k.gltf — 9008 bytes — `4e67385443e808bc709c054c1de5be1e83d4bf07eb0893884c301fec0bae8bc6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wall_clock/wall_clock_arm_1k.jpg — 444044 bytes — `c78aabec7bb4af4fd6818be1099523e59bf12d88c872530b2260cdea08d81968`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wall_clock/wall_clock_diff_1k.jpg — 366683 bytes — `012bfc3ceecd5e35679fe5764e33b6d1b8a631ad4fc9f5b267af25ad10468672`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wall_clock/wall_clock_glass_arm_1k.jpg — 376244 bytes — `42804955958b3d0fdc1da8d4c4e8e909b04f659ae1b02911e148abe0741b8b84`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wall_clock/wall_clock_nor_gl_1k.jpg — 236489 bytes — `6138946e055828e92d5e0d8d50c75e3d2da0ea789dd6512b30f85f0e18435d00`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/wall_clock/wall_clock.bin — 132412 bytes — `61d9fe03e871508230160de546ef505f3f4405b1e82c167536945a483a8bb639`
- `polyhaven/fancy_picture_frame_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fancy_picture_frame_01/fancy_picture_frame_01_1k.gltf — 5059 bytes — `c54803abf9e43c28a6b3fe76b38a60e827647a4f9a10747e6d4efba842289578`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/fancy_picture_frame_01/fancy_picture_frame_01.bin — 25948 bytes — `5d5a01ce8b89f1fbea87bac0ca9ab24771f0d2827ab0308f19878007e45f442f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_canvas_diff_1k.jpg — 100534 bytes — `86619612e96004b3c8dd61a6e745edda46b8d1793d5a1fb8306abed11448ffd9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_canvas_nor_gl_1k.jpg — 52182 bytes — `a77c51fc74606c177b79a1f2e5ebafde1e1d4f6ca851f3f39469afadae0e66ab`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_canvas_rough_1k.jpg — 71299 bytes — `58efa8c350534ef0161e37a6eeed480cab611c992deae9df5d64797cef5a269e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_diff_1k.jpg — 150435 bytes — `e511bd3a45b6979d505a652bc21bbb7b0d1cffb9908c67d9b5cd0d77b732a1b1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_nor_gl_1k.jpg — 216212 bytes — `b200c284bbdc9c16f6705b1f4c7bca2486898d83333f2e490d298c4422ee4b4a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fancy_picture_frame_01/fancy_picture_frame_01_rough_1k.jpg — 119837 bytes — `a393111f86fa9ffb8fa09f26c7f72a2a519f4120e9a68ee462280444a8a6055f`
- `polyhaven/barrel_stove@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/barrel_stove/barrel_stove_1k.gltf — 2747 bytes — `33006d0166cda06b377b749553571220c9dcbb6f89d42d123d74d0308cf4df32`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/barrel_stove/barrel_stove.bin — 267680 bytes — `09d7eb63b75a4a214fdb9f03349e5ddf990ea9865b3fbfb3fede6e5ccfa19e68`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_stove/barrel_stove_arm_1k.jpg — 789380 bytes — `f0ec5ddee6660953cad654e883e641f60e0c814afcbab2fa7c90a75843790145`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_stove/barrel_stove_diff_1k.jpg — 858608 bytes — `7661395a02b37db8dde222dd16947e41fa3b06d2ee9a198c57b6d015222afaeb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/barrel_stove/barrel_stove_nor_gl_1k.jpg — 228496 bytes — `533b75cb95ae236aab74c3a5b8ccbeff567b4a402c5bc3373c20c9afea48d680`
- `polyhaven/exterior_aircon_unit@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/exterior_aircon_unit/exterior_aircon_unit_1k.gltf — 9634 bytes — `f19d85c76948903047c2846068aeaa376d5e956a410675268cb6cb6aac5d97c2`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/exterior_aircon_unit/exterior_aircon_unit.bin — 494784 bytes — `b4b9ad082bdaa8f8b437bc14d9981caeaf318334499d4bf65d616fb2ec0c5ca8`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_01_arm_1k.jpg — 651293 bytes — `14671920f716691dc3b8940432f7aba5c469e3b466441ff8ad500de92d3178fb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_01_diff_1k.jpg — 506664 bytes — `2ae5005b4836d2c91d1e712d9acf425c7dcc4973b7c0fc6f23da9afaa6381da6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_01_nor_gl_1k.jpg — 472088 bytes — `e5a6f3c135b942d6efe62a24496c575d03f6a4316188efe65079035d7faf1c38`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_01_opacity_1k.jpg — 333675 bytes — `c19feb434c2b01923fbb3e16ace3aa6d9cb16b05c2a5c479ad237759b2d331d6`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_02_arm_1k.jpg — 484026 bytes — `1cdfa2d1c938c3af61a5f06510b0d94aeddddd4bdc1832008b3826240dd1535d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_02_nor_gl_1k.jpg — 942230 bytes — `864c0fb1e55aff910d826a8c1f6a2ad459f7db0124b5846445d466cabf0cadf5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_01_arm_1k.jpg — 673246 bytes — `51c103926b118bf00b902826001db802b15755c6eefa12b00afa24c60d7b341b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_01_diff_1k.jpg — 606076 bytes — `a8771db98ed7f3d46ce48fd70867f58a74a2530666c339f8dcc14f3e5de86d0b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_01_nor_gl_1k.jpg — 583620 bytes — `14f105cda9172290be2e8b23b8e895099b65e222619850af3b13105901d922e2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_02_arm_1k.jpg — 605557 bytes — `6ac4cfca6a8d8bec6ef1ff756652eb1f36b780d1ff7d70d9cb3e0f7fe1faf271`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_02_nor_gl_1k.jpg — 947477 bytes — `3af4716b42812b742577594c7a0a342accd79925f02037c152b1da1c5831bb78`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/exterior_aircon_unit/exterior_aircon_unit_rusted_02_opacity_1k.jpg — 357558 bytes — `a86bcaf9c4858cf250fd67c9a0ee362504454b9972ff6e1ac44e38bac3213421`
- `polyhaven/street_lamp_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/street_lamp_02/street_lamp_02_1k.gltf — 6429 bytes — `3a8a42486c5dc4538a8b44aeeef502c64a1c9d0d42fa5610e37886c355337ff8`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/street_lamp_02/street_lamp_02.bin — 530092 bytes — `e544c04855dcf728ff2724f691f6784690b8ba3ac323a9a332e56b271ffe1d7c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/street_lamp_02/street_lamp_02_arm_1k.jpg — 657710 bytes — `a1e2d654e7d5d48a1fdfbf720840192d171df54e5ea5f055145d0472d617eede`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/street_lamp_02/street_lamp_02_diff_1k.jpg — 303714 bytes — `19882567313dd43fef60f9fa41a4c55f81a957f9fee539e931fc36a32e386b6c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/street_lamp_02/street_lamp_02_nor_gl_1k.jpg — 372301 bytes — `fdd9fb26ca853020ed156fdd84e90ce3f9a68bf94edf71c0ffe72add67e316c6`
- `polyhaven/utility_box_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/utility_box_01/utility_box_01_1k.gltf — 2766 bytes — `5b9f8c45f2640c9dd831dc3450529e45b24c987208ddcf73010fe717ce8c454e`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_01/utility_box_01_arm_1k.jpg — 716061 bytes — `e65428774e94b6a8aeb7a23802e0af8f1568952ea79e21a7a3475b957e34956b`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_01/utility_box_01_diff_1k.jpg — 558681 bytes — `6a703a4cdf20c3fc3d0400fa815e5a1834836c96c207bdb57ba9e4a5db3a5532`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_01/utility_box_01_nor_gl_1k.jpg — 557001 bytes — `1c4e377906c13e864c9c7ffbd31a7d86075f28b948bf54872d6ad3ab38a08124`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/utility_box_01/utility_box_01.bin — 142552 bytes — `e4249eb754d7802154eed36bb12070dc24c90fc331f355d60ef7570d61fc0f5c`
- `polyhaven/utility_box_02@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/utility_box_02/utility_box_02_1k.gltf — 2764 bytes — `d3f87ce0852709498602f6a096be99a9e13f0ac2619f99edcebad9e89f9faf00`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_02/utility_box_02_arm_1k.jpg — 720694 bytes — `f85575f891c97354d2fff11d5d0e2bc5f7d3aeab853ff3d75100c30c177a9cc5`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_02/utility_box_02_diff_1k.jpg — 553096 bytes — `78a0c93b1d8d394beee5989c0d3470a9c8c4e902f708acf3c11cd4edafbe08b1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/utility_box_02/utility_box_02_nor_gl_1k.jpg — 552902 bytes — `e7c85b37fa5420591b6fa5dcef7875c927c8dc51f38c39c5844d53284ef37c74`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/utility_box_02/utility_box_02.bin — 199784 bytes — `0f0a3f8ecc0358e36e97120aa752c2456a78bf922671e6f77e402b0aa58ecfce`
- `polyhaven/metal_trash_can@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/metal_trash_can/metal_trash_can_1k.gltf — 15481 bytes — `ccdc55ecfe43db2174c9257891e92551882a874564bb9a7908cafc5268b46c0c`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/metal_trash_can/metal_trash_can.bin — 378288 bytes — `a9b9f526b655bef865933335f2cfc8c8f0bd1a35fda05b290a93e3061f2b6c8a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_arm_1k.jpg — 731776 bytes — `b23dcdb2ed40c1c6cfbd2d2779c6f075025b7269bfbbed2a70c6bdb7167e47fb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_diff_1k.jpg — 551939 bytes — `920c895a31b1cd2c000123c0592c70c33d46562752987da98070e7e0eebb662f`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_nor_gl_1k.jpg — 842945 bytes — `b977f17aa9d4718ffc91a62868b7171b4479578b8cffd1d32001d92552af81a4`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_rust_arm_1k.jpg — 620549 bytes — `31a6269e98a3a8b2a2d6db8f58724e0151d5312b5137e6d59b5a2ba873989159`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_rust_diff_1k.jpg — 768161 bytes — `51c44248305b111d978f7e0cbfe4a71ab7f49549968ce37c54b635d74c2cfba1`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/metal_trash_can/metal_trash_can_rust_nor_gl_1k.jpg — 1085844 bytes — `a5497588e00e5e56db72e701457fc8a46d3a1fa7d9dd7bf9d79e02cada09e84b`
- `polyhaven/water_manhole_cover@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/water_manhole_cover/water_manhole_cover_1k.gltf — 4253 bytes — `9d692740cb6e70cee977a6ccb54a270271b81250b47468e9ef6387bd58215cf9`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/water_manhole_cover/water_manhole_cover_arm_1k.jpg — 669586 bytes — `6d5856a467c9286fc993f2bd80bb5c30464fd8a127c8418fc8fc6c34bc54231d`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/water_manhole_cover/water_manhole_cover_diff_1k.jpg — 448420 bytes — `cb78919f60c929125317f19f9ecbba9f21089b7c0d6e0428c68f6fa401e6e720`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/water_manhole_cover/water_manhole_cover_nor_gl_1k.jpg — 1008913 bytes — `e2c1eac759b8c7430ffc8c59a45f4db98f890f9a22c3d968605a81e99e92bf43`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/water_manhole_cover/water_manhole_cover.bin — 202320 bytes — `ada713d1f6f879164d3475e2ee18d69b4c4ecc8f100126e3921b7b3ea42c9267`
- `polyhaven/wooden_ladder@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_ladder/wooden_ladder_1k.gltf — 4390 bytes — `ad20acb57354f726ef0970ba8e1e02ac12028581173d02b941a8dcf0325c333c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_ladder/wooden_ladder_arm_1k.jpg — 798553 bytes — `ed5fc0f9b1f053dbb43adbfb1e8db0429c42f01af49da117499a44f743db5a91`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_ladder/wooden_ladder_diff_1k.jpg — 758088 bytes — `c4219c7c0516099c04a1620e74967d358e70438dda042eb99a18cf8471462cfb`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/wooden_ladder/wooden_ladder_nor_gl_1k.jpg — 750034 bytes — `4539a49d3834e423b0940d1f04c06704acb56025c5fda24a5451ea7120efac50`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/wooden_ladder/wooden_ladder.bin — 282184 bytes — `a86818f7a4a6fbedf147d413cc761983fa03b2d5b88dfdda346ffb3ed71698ef`
- `polyhaven/WetFloorSign_01@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/WetFloorSign_01/WetFloorSign_01_1k.gltf — 2688 bytes — `ba5b10d2de7bb60b77dc3e44a96446181a078e35597947a490a4b6de906059e4`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/WetFloorSign_01/WetFloorSign_01.bin — 9496 bytes — `d23cdec8975ac452d64ae97b08f1eecd22e38f052bd5d588d352dbc0f0373af0`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WetFloorSign_01/WetFloorSign_01_arm_1k.jpg — 126370 bytes — `6cd1d7c6648c36d2d66a7ddfc620ea78374ac770a5726f879b6914366e133e1a`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WetFloorSign_01/WetFloorSign_01_diff_1k.jpg — 39755 bytes — `01e18486a858defc0f44a73ec5037c4bee770bae88e7fed5beb6877df120fa90`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/WetFloorSign_01/WetFloorSign_01_nor_gl_1k.jpg — 88138 bytes — `62269358f3b30569783c1872613d1d70d5eda36babe5b5f04fcfd5e92de1af62`
- `polyhaven/fire_alarm@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fire_alarm/fire_alarm_1k.gltf — 4264 bytes — `4a924f45a0f23036a938e06a251677f9654f39507f0e13d06cc4a0b05c83b959`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/fire_alarm/fire_alarm.bin — 112072 bytes — `f65b6fe5ed53c248497fe833ac66d5b8c452e28db4b02b8d1b67109fcc2ce132`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fire_alarm/fire_alarm_arm_1k.jpg — 650243 bytes — `b98f4fe9f190b74581cdff5a9e075d42cd48c16c5f9aba321c5dfe8ce93058a7`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fire_alarm/fire_alarm_diff_1k.jpg — 540983 bytes — `fc0558110922f7f5ae83e488b913857b576946a33ef46c89886f7c6de722e660`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fire_alarm/fire_alarm_nor_gl_1k.jpg — 642044 bytes — `45aa3e47120decf5a28e81a2586e3a4c8d6cdb10ba5ceed66d905de74fe1dbb7`
- `polyhaven/all_purpose_cleaner@1k`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/all_purpose_cleaner/all_purpose_cleaner_1k.gltf — 3211 bytes — `935c5a4ea198cb5d2731a211e483c27fc21fe213f8f7f1421521e7d6cc012535`
  - https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/all_purpose_cleaner/all_purpose_cleaner.bin — 117216 bytes — `d6778f2b88314bce956824f419a31a3333b988ddf6a0360b5045a06c6c20c3a2`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/all_purpose_cleaner/all_purpose_cleaner_arm_1k.jpg — 432313 bytes — `dfa102c5c0a5124e3079275f9c87c039d27e7543383b61b1f686693b0fd4cc55`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/all_purpose_cleaner/all_purpose_cleaner_diff_1k.jpg — 355694 bytes — `6b65e99cc43028a69de9f0825f44f0584f7e0bb7126e9cbfe74fc28dbf4c452c`
  - https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/all_purpose_cleaner/all_purpose_cleaner_nor_gl_1k.jpg — 146701 bytes — `d7a1d07a94b2ddf987c614c690e649d1848549578b1be7d06083aab9e4380221`

## WP-P1-fonts

UI typefaces under the SIL Open Font License 1.1, from the Google Fonts repository at a pinned commit. Shipped as
subset, weight-limited WOFF2 files (modified versions under the OFL) with their OFL.txt beside them in
`assets/fonts/<face>/`, built by `tools/fonts/build.sh` (fontTools). Noto Sans SC keeps only the characters the game
shows (`tools/fonts/charset.json`). The subset keeps the family name Noto Sans SC: Adobe's Reserved Font Name is
'Source', which no shipped name uses.

### Assets

| Asset | Provider | Author(s) | License | Made by | Used for |
| --- | --- | --- | --- | --- | --- |
| [Noto Sans](https://github.com/google/fonts/tree/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosans) (`googlefonts/notosans@b5efa9c32e8f`) | Google Fonts (github.com/google/fonts) | The Noto Project Authors | [OFL-1.1](https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosans/OFL.txt) | Variable TrueType font | fonts/noto-sans (UI Latin text) |
| [Noto Sans SC](https://github.com/google/fonts/tree/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosanssc) (`googlefonts/notosanssc@b5efa9c32e8f`) | Google Fonts (github.com/google/fonts) | Adobe, The Noto Project Authors | [OFL-1.1](https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosanssc/OFL.txt) | Variable TrueType font | fonts/noto-sans-sc (UI Chinese text, subset) |

### Downloads (URL and SHA-256)

- `googlefonts/notosans@b5efa9c32e8f`
  - https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf — 2049096 bytes — `bfb7bb691513f12e734dc346c03a03f784912432d7e3fa8e56efcf906fe86b3d`
  - https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosans/OFL.txt — 4396 bytes — `cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a`
- `googlefonts/notosanssc@b5efa9c32e8f`
  - https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf — 17772300 bytes — `a3041811a78c361b1de50f953c805e0244951c21c5bd412f7232ef0d899af0da`
  - https://github.com/google/fonts/raw/b5efa9c32e8f9b63005f5cdb1ad5527a77d2cd04/ofl/notosanssc/OFL.txt — 4388 bytes — `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9`
