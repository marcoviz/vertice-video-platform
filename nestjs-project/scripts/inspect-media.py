"""Bounded-memory inspection of real media; runs inside the application image."""
import argparse
import json
import os
import struct
import subprocess
import sys
import tempfile
import threading
import time
from contextlib import contextmanager


@contextmanager
def bounded_process(command, errors, seconds):
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
    expired = threading.Event()
    def terminate():
        expired.set()
        if process.poll() is None:
            process.kill()
    timer = threading.Timer(seconds, terminate)
    timer.daemon = True
    timer.start()
    try:
        yield process
        process.wait()
        if expired.is_set():
            raise TimeoutError(f'Media command exceeded {seconds} seconds')
        if process.returncode:
            errors.seek(0)
            raise RuntimeError(errors.read(8192))
    finally:
        timer.cancel()
        if process.poll() is None:
            process.kill()
        process.wait()
        process.stdout.close()


def inspect(path, decode=False, atoms=False):
    result = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,r_frame_rate,duration,nb_frames,channels,sample_rate',
        '-of', 'json', str(path),
    ], text=True, timeout=120))
    counts = {}
    with tempfile.TemporaryFile(mode='w+') as errors:
        command = [
            'ffprobe', '-v', 'error', '-show_packets', '-show_entries',
            'packet=stream_index,size', '-of', 'csv=p=0', str(path),
        ]
        with bounded_process(command, errors, 300) as process:
            for line in process.stdout:
                fields = line.strip().split(',')
                if len(fields) < 2 or not all(x.isdigit() for x in fields[:2]):
                    continue
                stream, size = map(int, fields[:2])
                item = counts.setdefault(str(stream), {'packets': 0, 'bytes': 0})
                item['packets'] += 1
                item['bytes'] += size
    result['packet_totals'] = counts
    av_indices = {str(s['index']) for s in result['streams'] if s['codec_type'] in ('video', 'audio')}
    result['av_packet_bytes'] = sum(v['bytes'] for k, v in counts.items() if k in av_indices)
    result['av_fraction'] = result['av_packet_bytes'] / os.path.getsize(path)
    if atoms:
        result['atoms'] = []
        with open(path, 'rb') as media:
            offset, length = 0, os.path.getsize(path)
            while offset < length:
                media.seek(offset)
                header = media.read(8)
                assert len(header) == 8, 'Truncated atom'
                size, kind = struct.unpack('>I4s', header)
                if size == 1:
                    size = struct.unpack('>Q', media.read(8))[0]
                elif size == 0:
                    size = length - offset
                assert size >= 8 and offset + size <= length, 'Invalid atom size'
                result['atoms'].append({'type': kind.decode('ascii'), 'offset': offset, 'bytes': size})
                offset += size
    if decode:
        started = time.monotonic()
        progress = {}
        with tempfile.TemporaryFile(mode='w+') as errors:
            command = [
                'ffmpeg', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode',
                '-threads', '2', '-i', str(path), '-map', '0:v:0', '-map', '0:a:0',
                '-progress', 'pipe:1', '-stats_period', '30', '-f', 'null', '-',
            ]
            with bounded_process(command, errors, 3600) as process:
                for line in process.stdout:
                    key, _, value = line.strip().partition('=')
                    progress[key] = value
                    if key == 'progress':
                        print(f"DECODE {os.path.basename(path)} frames={progress.get('frame')} time={progress.get('out_time')} speed={progress.get('speed')}", file=sys.stderr, flush=True)
        assert progress.get('progress') == 'end'
        frames = int(progress['frame'])
        video = next(s for s in result['streams'] if s['codec_type'] == 'video')
        if str(video.get('nb_frames', '')).isdigit():
            assert frames == int(video['nb_frames']), 'Incomplete video decode'
        result['full_decode'] = {'passed': True, 'frames': frames, 'output_time': progress['out_time'],
                                 'elapsed_seconds': round(time.monotonic() - started, 3)}
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('path')
    parser.add_argument('--decode', action='store_true')
    parser.add_argument('--atoms', action='store_true')
    args = parser.parse_args()
    print(json.dumps(inspect(args.path, args.decode, args.atoms)))
