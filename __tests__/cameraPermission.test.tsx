import { render, waitFor, screen } from '@testing-library/react-native';
import CameraScreen from '@/app/child/camera';
const mockRequest = jest.fn();
let mockPermission = { granted: false, status: 'undetermined', canAskAgain: true };
jest.mock('expo-camera', () => ({ CameraView: 'CameraView', useCameraPermissions: () => [mockPermission, mockRequest, jest.fn()] }));
jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ id: '1', label: 'Math' }) }));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
jest.mock('@/lib/api', () => ({ api: {} }));
jest.mock('@/lib/offline', () => ({ enqueuePhoto: jest.fn(), isNetworkError: jest.fn() }));
it('requests the system permission on opening the camera, once, without a pre-permission choice', async () => {
  mockRequest.mockResolvedValue({ granted: false });
  const view = await render(<CameraScreen />);
  await waitFor(() => expect(mockRequest).toHaveBeenCalledTimes(1));
  await view.rerender(<CameraScreen />);
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Allow camera')).toBeNull();
  expect(screen.queryByText('Разрешить камеру')).toBeNull();
});
it('respects an earlier denial without requesting permission again', async () => {
  mockPermission = { granted: false, status: 'denied', canAskAgain: false };
  await render(<CameraScreen />);
  expect(mockRequest).not.toHaveBeenCalled();
});
