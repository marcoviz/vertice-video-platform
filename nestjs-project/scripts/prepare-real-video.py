"""Create a near-10-GB MOV from real footage, without padding or repeated scenes."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import subprocess
import time
import urllib.request

SOURCE_URL = 'https://media.xiph.org/tearsofsteel/tears_of_steel_1080p.webm'
SOURCE_SHA256 = '328253280a05e6b14a92f1f43d818d9b7d38ab5d3f6d5d98606198fd3daef2ff'


def sha256(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('directory', type=pathlib.Path)
    parser.add_argument('--limit-bytes', type=int, default=10_000_000_000)
    args = parser.parse_args()
    assert 50_000_000 <= args.limit_bytes <= 10_000_000_000
    directory = args.directory
    directory.mkdir(parents=True, exist_ok=True)
    source = directory / 'tears_of_steel_1080p.webm'
    if not source.exists():
        print('Downloading licensed Tears of Steel source', flush=True)
        with urllib.request.urlopen(SOURCE_URL, timeout=120) as response, source.open('wb') as output:
            while block := response.read(1024 * 1024):
                output.write(block)
    assert sha256(source) == SOURCE_SHA256, 'Source checksum mismatch'
    target = directory / 'tears-of-steel-dnxhd.mov'
    command = [
        'ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '2', '-i', str(source),
        '-map', '0:v:0', '-map', '0:a:0', '-filter_threads', '2',
        '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=25',
        '-c:v', 'dnxhd', '-b:v', '185M', '-pix_fmt', 'yuv422p', '-threads', '2',
        '-c:a', 'pcm_s16le', '-ac', '2', '-ar', '48000',
        '-metadata', 'title=Tears of Steel — validation excerpt',
        '-metadata', 'artist=Blender Foundation',
        '-metadata', 'copyright=CC BY 3.0 — https://mango.blender.org/',
        # FFmpeg stops after a full packet, then writes MOV tables. Leave room
        # for that natural overhead; never append free/skip atoms or truncate.
        '-fs', str(args.limit_bytes - 3_000_000), '-progress', 'pipe:1',
        '-stats_period', '30', str(target),
    ]
    started = time.monotonic()
    subprocess.run(command, check=True, timeout=3600)
    size = target.stat().st_size
    assert args.limit_bytes - 10_000_000 <= size <= args.limit_bytes, size
    spec = importlib.util.spec_from_file_location('inspect_media', pathlib.Path(__file__).with_name('inspect-media.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    media = module.inspect(target, decode=True, atoms=True)
    assert media['av_fraction'] > 0.999, media['av_fraction']
    assert sum(a['bytes'] for a in media['atoms'] if a['type'] in ('free', 'skip')) <= 1024
    video = next(s for s in media['streams'] if s['codec_type'] == 'video')
    audio = next(s for s in media['streams'] if s['codec_type'] == 'audio')
    assert video['codec_name'] == 'dnxhd' and audio['codec_name'] == 'pcm_s16le'
    assert abs(float(video['duration']) - float(audio['duration'])) < 1
    report = {
        'source': {'title': 'Tears of Steel', 'creator': 'Blender Foundation',
                   'url': SOURCE_URL, 'sha256': SOURCE_SHA256,
                   'license': 'CC BY 3.0', 'license_url': 'https://creativecommons.org/licenses/by/3.0/',
                   'credits': 'https://mango.blender.org/',
                   'adaptation': 'Contiguous opening excerpt, letterboxed to 1920x1080/25fps, DNxHD 185M + stereo PCM. No scene loops, synthetic footage or byte padding.'},
        'command': command, 'target_limit_bytes': args.limit_bytes, 'bytes': size,
        'distance_to_limit_bytes': args.limit_bytes - size, 'sha256': sha256(target),
        'media': media, 'preparation_elapsed_seconds': round(time.monotonic() - started, 3),
        'ffmpeg': subprocess.check_output(['ffmpeg', '-version'], text=True).splitlines()[0],
    }
    (directory / 'input-evidence.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('REAL_MEDIA_INPUT ' + json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
