import { ConfigService } from '@nestjs/config';
import { PaymentSimulator } from './payment-simulator';

const simulatorWithRate = (rate: number) =>
  new PaymentSimulator({ getOrThrow: () => rate } as unknown as ConfigService);

describe('PaymentSimulator', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns the forced outcome when one is given', () => {
    const simulator = simulatorWithRate(0.5);
    expect(simulator.charge('SUCCESS')).toEqual({ outcome: 'SUCCESS' });
    expect(simulator.charge('PENDING')).toEqual({ outcome: 'PENDING' });
    expect(simulator.charge('FAILED')).toEqual({
      outcome: 'FAILED',
      failureReason: 'Card declined (simulated)',
    });
  });

  it('uses the configured success rate when no outcome is forced', () => {
    const simulator = simulatorWithRate(0.7);
    jest.spyOn(Math, 'random').mockReturnValueOnce(0.69).mockReturnValueOnce(0.7);
    expect(simulator.charge().outcome).toBe('SUCCESS');
    expect(simulator.charge().outcome).toBe('FAILED');
  });

  it('never succeeds at rate 0 and always succeeds at rate 1', () => {
    for (let i = 0; i < 20; i++) {
      expect(simulatorWithRate(0).charge().outcome).toBe('FAILED');
      expect(simulatorWithRate(1).charge().outcome).toBe('SUCCESS');
    }
  });
});
