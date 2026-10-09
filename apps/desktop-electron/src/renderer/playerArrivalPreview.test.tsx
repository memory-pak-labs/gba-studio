/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { RoomSceneEventMarker } from './roomsWorkspace';
import { deriveRoomsWorkspacePresentation } from '../shared/roomsWorkspace';
import { gbaActorSpriteRoomPlacementFromFrame } from '../shared/gbaRendering';
import { playerArrivalPreview } from '../shared/playerArrivalPreview';

afterEach(cleanup);
it('shows a read-only player at the arrival and updates facing through the event only', () => {
  const data = JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project', 'utf8'));
  const before = JSON.stringify(data);
  const presentation = deriveRoomsWorkspacePresentation(data);
  const room = presentation.rooms.find(r => r.name === 'porto_lumen')!;
  const player = presentation.entities.find(e => e.roomName === room.name && e.isPlayer)!;
  const update = vi.fn();
  render(<RoomSceneEventMarker room={room} projectData={data} playerEntity={player} projectPath="/project/example.gba-project"
    onUpdateEventStep={update} link={{ id:'arrival', from:'mapa_rota', to:room.name,
      eventID:'test', eventName:'entrada', stepIndex:0, x:10, y:12, direction:'down',
      command:'change_scene porto_lumen 10 12 down' }} />);
  const marker = screen.getByRole('button', { name: 'Destino de entrada: 10, 12, direção down' });
  fireEvent.focus(marker);
  const preview = screen.getByLabelText('Prévia de chegada do player: 10, 12, down');
  expect(preview).toHaveStyle({ pointerEvents:'none' });
  const frame = playerArrivalPreview(data, room.name, room.playerActorName, 'down')!.sprite.frame!;
  const placement = gbaActorSpriteRoomPlacementFromFrame(10, 12, frame);
  expect(preview.style.left).toBe(`${placement.leftTiles / room.width * 100}%`);
  expect(preview.style.top).toBe(`${placement.topTiles / room.height * 100}%`);
  fireEvent.click(screen.getByRole('button', { name:'Alterar direção de chegada de entrada' }));
  expect(screen.getByLabelText('Prévia de chegada do player: 10, 12, left')).toBeInTheDocument();
  expect(update).toHaveBeenCalledWith('test', 0, { command:'change_scene porto_lumen 10 12 left' });
  expect(JSON.stringify(data)).toBe(before);
});

it('releases the arrival preview when the selected direction has no authored idle pose', () => {
  const data = JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project', 'utf8'));
  const presentation = deriveRoomsWorkspacePresentation(data);
  const room = presentation.rooms.find(r => r.name === 'penedos_vento')!;
  const player = presentation.entities.find(e => e.roomName === room.name && e.isPlayer)!;
  const onPreviewVisibilityChange = vi.fn();
  render(<RoomSceneEventMarker room={room} projectData={data} playerEntity={player} projectPath="/project/example.gba-project"
    onArrivalPreviewVisibilityChange={onPreviewVisibilityChange}
    link={{ id:'penedos-arrival', from:'mapa_rota', to:room.name,
      eventID:'test-penedos', eventName:'entrada_penedos', stepIndex:0, x:4, y:10, direction:'right',
      command:'change_scene penedos_vento 4 10 right' }} />);

  fireEvent.focus(screen.getByRole('button', { name: 'Destino de entrada_penedos: 4, 10, direção right' }));
  expect(screen.getByLabelText('Prévia de chegada do player: 4, 10, right')).toBeInTheDocument();
  expect(onPreviewVisibilityChange).toHaveBeenLastCalledWith('penedos-arrival', true);

  fireEvent.click(screen.getByRole('button', { name: 'Alterar direção de chegada de entrada_penedos' }));

  expect(screen.queryByLabelText('Prévia de chegada do player: 4, 10, down')).not.toBeInTheDocument();
  expect(onPreviewVisibilityChange).toHaveBeenLastCalledWith('penedos-arrival', false);
});
