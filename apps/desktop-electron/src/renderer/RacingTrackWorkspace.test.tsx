/** @vitest-environment happy-dom */
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,expect,it,vi} from 'vitest';
import {RoomsWorkspace} from './roomsWorkspace';
import {createBlankProjectData} from '../shared/newProject';
import {createRoomInProject,setActiveRoomInProject,deriveRoomsWorkspacePresentation} from '../shared/roomsWorkspace';
import {createRacingCircuitTrack} from '../shared/racingAuthoring';
afterEach(cleanup);
function roomsWorkspaceHandlers(overrides: Record<string, unknown> = {}) {
  return {
    onCreateRoom: vi.fn(() => "room-2"),
    onSetActiveRoom: vi.fn(),
    onUpdateRoomFields: vi.fn(),
    onApplyTileBrush: vi.fn(),
    onSetActiveTileLayerMapping: vi.fn(),
    onToggleCollisionCell: vi.fn(),
    onSetCollisionType: vi.fn(),
    onApplyCollisionFill: vi.fn(),
    onSetHeightLevel: vi.fn(),
    onCreateRoomConnection: vi.fn(),
    onRemoveRoomConnection: vi.fn(),
    onUpdateRoomConnection: vi.fn(),
    onUpdateRoomEntity: vi.fn(),
    onUpdateHudPreset: vi.fn(),
    onPlaceRoomEntity: vi.fn(),
    onResizeRoomTrigger: vi.fn(),
    onCreateTrigger: vi.fn(),
    onCreateActor: vi.fn(),
    onNudgeRoomEntities: vi.fn(),
    onAlignRoomEntities: vi.fn(),
    onDistributeRoomEntities: vi.fn(),
    onDuplicateRoomEntities: vi.fn(),
    onRemoveRoomEntities: vi.fn(),
    onUpdateSceneMapPosition: vi.fn(),
    onUpdateSceneMapZoom: vi.fn(),
    onUpdateSceneOrganization: vi.fn(),
    onUpdateRoomBackgroundTilesetGrid: vi.fn(),
    onRenameRoom: vi.fn(),
    onRemoveRoom: vi.fn(),
    onSetStartRoom: vi.fn(),
    onRunRoom: vi.fn(),
    runRoomDisabled: false,
    onImportTileset: vi.fn(async () => undefined),
    onImportTiledMap: vi.fn(async () => undefined),
    onCreateEventReference: vi.fn(),
    onSynchronizePrefabs: vi.fn(),
    onCreatePrefabFromEntity: vi.fn(),
    onInstantiatePrefab: vi.fn(),
    onUpdatePrefab: vi.fn(),
    ...overrides
  };
}


it.each(['topdown','pseudo3d'])('uses native gate selection and events inside Gatilho in %s',async(presentationMode)=>{
 const user=userEvent.setup();const p=setActiveRoomInProject(createRoomInProject(createBlankProjectData({name:'Race editing'}),{id:'room-race',name:'circuit',sceneType:'racing',width:64,height:64}),'room-race');
 for(const key of ['scenas','rooms'])for(const s of (p[key] as Record<string,any>[]??[]))if(s.id==='room-race')s.runtime={type:'racing',config:{presentation:presentationMode,rivalSpeed:105,topdownTrack:createRacingCircuitTrack(64,64)}};
 const handlers=roomsWorkspaceHandlers();render(<RoomsWorkspace presentation={deriveRoomsWorkspacePresentation(p)} projectData={p} {...handlers}/>);
 await user.click(screen.getByRole('button',{name:'Editar cena circuit'}));await user.click(screen.getByRole('button',{name:/^(Gatilho|Trigger) - Eventos/}));
 expect(screen.getByRole('button',{name:'Mapa'})).toHaveAttribute('aria-pressed','true');
 await user.click(screen.getByRole('button',{name:'Selecionar Checkpoint 1'}));
 expect(screen.getByRole('spinbutton',{name:'Centro X'})).toHaveValue(384);
 fireEvent.keyDown(screen.getByRole('button',{name:'Selecionar Checkpoint 1'}),{key:'ArrowRight'});
 expect(handlers.onUpdateRoomFields).toHaveBeenCalledTimes(1);expect((handlers.onUpdateRoomFields.mock.calls as unknown as Array<[string,{runtime:{config:unknown}}]>)[0][1].runtime.config).toMatchObject({rivalSpeed:105,topdownTrack:{checkpoints:expect.arrayContaining([expect.objectContaining({id:'checkpoint-1',x:385})])}});
 expect(handlers.onCreateTrigger).not.toHaveBeenCalled();
 await user.click(screen.getByRole('button',{name:'Eventos da corrida'}));expect(screen.getAllByText('Ao completar volta').length).toBeGreaterThan(0);expect(screen.getByRole('option',{name:/Ao validar chegada/})).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Áreas de evento'}));expect(screen.getByRole('button',{name:'Criar gatilho'})).toBeInTheDocument();
});
