"""Stage 'export': the animated character .blend -> an uncompressed skinned glTF binary (PNG textures), one glTF
animation per clip (named after the clip), at most 4 joint influences per vertex, Y up, the character facing +Z.

    Blender --background --factory-startup --python export.py -- <animated.blend> <out.glb>

compress.mjs then turns the textures into KTX2, applies meshopt compression and writes the shipped file.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import pipeline as common  # noqa: E402


def main():
    blend, out = common.script_args()[:2]
    bpy.ops.wm.open_mainfile(filepath=blend)
    rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    # every clip sits on its own NLA track: the ACTIONS mode exports each of them as a glTF animation
    rig.animation_data.action = None
    for t in rig.animation_data.nla_tracks:
        t.mute = False
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_vertex_color="NONE",
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_def_bones=True,
        export_rest_position_armature=True,
        export_leaf_bone=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_force_sampling=True,
        export_frame_step=1,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )
    print(f"SUMMARY {{\"glb\": \"{os.path.relpath(out, common.ROOT)}\", \"bytes\": {os.path.getsize(out)}}}", flush=True)


if __name__ == "__main__":
    main()
