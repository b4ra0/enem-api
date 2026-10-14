import z from '@/lib/zod';

export const ApplicationValues = ['regular', 'reaplicacao'] as const;

export type Application = (typeof ApplicationValues)[number];

export const ApplicationSchema = z
    .enum(ApplicationValues)
    .describe(
        'A aplicação da prova: "regular" (aplicação padrão) ou "reaplicacao" (segunda aplicação)',
    )
    .openapi({ example: 'regular' });

export const ApplicationQuerySchema = z
    .enum(ApplicationValues)
    .default('regular')
    .describe(
        'A aplicação da prova: "regular" (aplicação padrão, valor default) ou ' +
            '"reaplicacao" (segunda aplicação). Quando "reaplicacao", retorna ' +
            'a prova da reaplicação do mesmo ano, se disponível.',
    )
    .openapi({ example: 'reaplicacao' });
