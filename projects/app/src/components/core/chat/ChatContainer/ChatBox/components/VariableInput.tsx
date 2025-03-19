import React, { useEffect, useMemo } from 'react';
import { Controller, UseFormReturn } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { Box, Button, Card, Flex, Switch, Textarea } from '@chakra-ui/react';
import ChatAvatar from './ChatAvatar';
import { MessageCardStyle } from '../constants';
import {
  VariableInputEnum,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { ChatBoxInputFormType } from '../type.d';
import { useContextSelector } from 'use-context-selector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { VariableItemType } from '@fastgpt/global/core/app/type';
import MyTextarea from '@/components/common/Textarea/MyTextarea';
import MyNumberInput from '@fastgpt/web/components/common/Input/NumberInput';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { ChatBoxContext } from '../Provider';
import dynamic from 'next/dynamic';

const JsonEditor = dynamic(() => import('@fastgpt/web/components/common/Textarea/JsonEditor'));

export const VariableInputItem = ({
  item,
  variablesForm
}: {
  item: VariableItemType;
  variablesForm: UseFormReturn<any>;
}) => {
  const { register, control, setValue } = variablesForm;

  return (
    <Box key={item.id} mb={4} pl={1}>
      <Box
        as={'label'}
        display={'flex'}
        position={'relative'}
        mb={1}
        alignItems={'center'}
        w={'full'}
      >
        {item.label}
        {item.required && (
          <Box position={'absolute'} top={'-2px'} left={'-8px'} color={'red.500'}>
            *
          </Box>
        )}
        {item.description && <QuestionTip ml={1} label={item.description} />}
      </Box>
      {item.type === VariableInputEnum.input && (
        <MyTextarea
          autoHeight
          minH={40}
          maxH={160}
          bg={'myGray.50'}
          {...register(`variables.${item.key}`, {
            required: item.required
          })}
        />
      )}
      {item.type === VariableInputEnum.textarea && (
        <Textarea
          {...register(`variables.${item.key}`, {
            required: item.required
          })}
          rows={5}
          bg={'myGray.50'}
          maxLength={item.maxLength || 4000}
        />
      )}
      {item.type === VariableInputEnum.select && (
        <Controller
          key={`variables.${item.key}`}
          control={control}
          name={`variables.${item.key}`}
          rules={{ required: item.required }}
          render={({ field: { ref, value } }) => {
            return (
              <MySelect
                ref={ref}
                width={'100%'}
                list={(item.enums || []).map((item: { value: any }) => ({
                  label: item.value,
                  value: item.value
                }))}
                value={value}
                onChange={(e) => setValue(`variables.${item.key}`, e)}
              />
            );
          }}
        />
      )}
      {item.type === VariableInputEnum.numberInput && (
        <Controller
          key={`variables.${item.key}`}
          control={control}
          name={`variables.${item.key}`}
          rules={{ required: item.required, min: item.min, max: item.max }}
          render={({ field: { value, onChange } }) => (
            <MyNumberInput
              step={1}
              min={item.min}
              max={item.max}
              bg={'white'}
              value={value}
              onChange={onChange}
            />
          )}
        />
      )}
    </Box>
  );
};

export const ExternalVariableInputItem = ({
  item,
  variablesForm,
  showTag = false
}: {
  item: VariableItemType;
  variablesForm: UseFormReturn<any>;
  showTag?: boolean;
}) => {
  const { t } = useTranslation();
  const { register, control } = variablesForm;

  const Label = useMemo(() => {
    return (
      <Box display={'flex'} position={'relative'} mb={1} alignItems={'center'} w={'full'}>
        {item.label}
        {item.description && <QuestionTip ml={1} label={item.description} />}
        {showTag && (
          <Flex
            color={'primary.600'}
            bg={'primary.100'}
            px={2}
            py={1}
            gap={1}
            ml={2}
            fontSize={'mini'}
            rounded={'sm'}
          >
            <MyIcon name={'common/info'} color={'primary.600'} w={4} />
            {t('chat:variable_invisable_in_share')}
          </Flex>
        )}
      </Box>
    );
  }, [item.description, item.label, showTag, t]);

  return (
    <Box key={item.id} mb={4} pl={1}>
      {Label}
      <Controller
        control={control}
        name={`variables.${item.key}`}
        render={({ field: { onChange, value } }) => {
          if (item.valueType === WorkflowIOValueTypeEnum.string) {
            return (
              <MyTextarea
                autoHeight
                minH={40}
                maxH={160}
                bg={'myGray.50'}
                {...register(`variables.${item.key}`)}
              />
            );
          }
          if (item.valueType === WorkflowIOValueTypeEnum.number) {
            return <MyNumberInput step={1} bg={'myGray.50'} value={value} onChange={onChange} />;
          }
          if (item.valueType === WorkflowIOValueTypeEnum.boolean) {
            return <Switch isChecked={value} onChange={onChange} />;
          }
          return <JsonEditor bg={'myGray.50'} resize value={value} onChange={onChange} />;
        }}
      />
    </Box>
  );
};

const VariableInput = ({
  chatForm,
  chatStarted,
  showExternalVariables = false
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  showExternalVariables?: boolean;
}) => {
  const { t } = useTranslation();

  const appAvatar = useContextSelector(ChatItemContext, (v) => v.chatBoxData?.app?.avatar);
  const variablesForm = useContextSelector(ChatItemContext, (v) => v.variablesForm);
  const variableList = useContextSelector(ChatBoxContext, (v) => v.variableList);
  const allVariableList = useContextSelector(ChatBoxContext, (v) => v.allVariableList);

  const externalVariableList = useMemo(
    () =>
      allVariableList.filter((item) =>
        showExternalVariables ? item.type === VariableInputEnum.custom : false
      ),
    [allVariableList, showExternalVariables]
  );

  const { getValues, setValue, handleSubmit: handleSubmitChat } = variablesForm;

  useEffect(() => {
    allVariableList.forEach((item) => {
      const val = getValues(`variables.${item.key}`);
      if (item.defaultValue !== undefined && (val === undefined || val === null || val === '')) {
        setValue(`variables.${item.key}`, item.defaultValue);
      }
    });
  }, [allVariableList, getValues, setValue, variableList]);

  return (
    <Box py={3}>
      <ChatAvatar src={appAvatar} type={'AI'} />
      {externalVariableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            mt={2}
            w={'400px'}
            {...MessageCardStyle}
            bg={'white'}
            boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
          >
            <Flex
              color={'primary.600'}
              bg={'primary.100'}
              mb={3}
              px={3}
              py={1.5}
              gap={1}
              fontSize={'mini'}
              rounded={'sm'}
            >
              <MyIcon name={'common/info'} color={'primary.600'} w={4} />
              {t('chat:variable_invisable_in_share')}
            </Flex>
            {externalVariableList.map((item) => (
              <ExternalVariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
            {variableList.length === 0 && !chatStarted && (
              <Box>
                <Button
                  leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                  size={'sm'}
                  maxW={'100px'}
                  onClick={handleSubmitChat(() => {
                    chatForm.setValue('chatStarted', true);
                  })}
                >
                  {t('common:core.chat.Start Chat')}
                </Button>
              </Box>
            )}
          </Card>
        </Box>
      )}

      {variableList.length > 0 && (
        <Box textAlign={'left'}>
          <Card
            order={2}
            mt={2}
            w={'400px'}
            {...MessageCardStyle}
            bg={'white'}
            boxShadow={'0 0 8px rgba(0,0,0,0.15)'}
          >
            {variableList.map((item) => (
              <VariableInputItem key={item.id} item={item} variablesForm={variablesForm} />
            ))}
            {!chatStarted && (
              <Box>
                <Button
                  leftIcon={<MyIcon name={'core/chat/chatFill'} w={'16px'} />}
                  size={'sm'}
                  maxW={'100px'}
                  onClick={handleSubmitChat(() => {
                    chatForm.setValue('chatStarted', true);
                  })}
                >
                  {t('common:core.chat.Start Chat')}
                </Button>
              </Box>
            )}
          </Card>
        </Box>
      )}
    </Box>
  );
};

export default VariableInput;
