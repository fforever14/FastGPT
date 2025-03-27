import React from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyModal from '@fastgpt/web/components/common/MyModal';
import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  useDisclosure
} from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { postCreateTeam, putUpdateTeam } from '@/web/support/user/team/api';
import { CreateTeamProps } from '@fastgpt/global/support/user/team/controller.d';
import { DEFAULT_TEAM_AVATAR } from '@fastgpt/global/common/system/constants';
import Icon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
const UpdateContact = dynamic(() => import('@/components/support/user/inform/UpdateContactModal'));

export type EditTeamFormDataType = CreateTeamProps & {
  id?: string;
  notificationAccount?: string;
};

export const defaultForm = {
  name: '',
  avatar: DEFAULT_TEAM_AVATAR
};

function EditModal({
  defaultData = defaultForm,
  onClose,
  onSuccess
}: {
  defaultData?: EditTeamFormDataType;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation();

  const { register, setValue, handleSubmit, watch } = useForm<CreateTeamProps>({
    defaultValues: defaultData
  });
  const avatar = watch('avatar');
  const notificationAccount = watch('notificationAccount');

  const {
    File,
    onOpen: onOpenSelectFile,
    onSelectImage
  } = useSelectFile({
    fileType: '.jpg,.png,.svg',
    multiple: false
  });

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (data: CreateTeamProps) => {
      return postCreateTeam(data);
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common:common.Create Success'),
    errorToast: t('common:common.Create Failed')
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: async (data: EditTeamFormDataType) => {
      if (!data.id) return Promise.resolve('');
      return putUpdateTeam({
        name: data.name,
        avatar: data.avatar
      });
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: t('common:common.Update Success'),
    errorToast: t('common:common.Update Failed')
  });

  const { isOpen: isOpenContact, onClose: onCloseContact, onOpen: onOpenContact } = useDisclosure();

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="support/team/group"
      iconColor="primary.600"
      title={defaultData.id ? t('user:team.Update Team') : t('user:team.Create Team')}
    >
      <ModalBody>
        <Box color={'myGray.800'} fontWeight={'bold'}>
          {t('account_team:set_name_avatar')}
        </Box>
        <Flex mt={3} alignItems={'center'}>
          <MyTooltip label={t('common:common.Set Avatar')}>
            <Avatar
              flexShrink={0}
              src={avatar}
              w={['28px', '32px']}
              h={['28px', '32px']}
              cursor={'pointer'}
              borderRadius={'md'}
              onClick={onOpenSelectFile}
            />
          </MyTooltip>
          <Input
            flex={1}
            ml={4}
            autoFocus
            bg={'myWhite.600'}
            maxLength={100}
            placeholder={t('user:team.Team Name')}
            {...register('name', {
              required: t('common:common.Please Input Name')
            })}
          />
        </Flex>
        <Box color={'myGray.800'} fontWeight={'bold'} mt={4}>
          {t('account_team:notification_recieve')}
        </Box>
        <HStack w="full" justifyContent={'space-between'}>
          {(() => {
            return notificationAccount ? (
              <Box width="full">{notificationAccount}</Box>
            ) : (
              <HStack
                px="3"
                py="1"
                color="red.600"
                bgColor="red.50"
                borderRadius="md"
                fontSize={'sm'}
                width={'fit-content'}
              >
                <Icon name="common/info" w="1rem" />
                <Box width="fit-content">{t('account_team:please_bind_contact')}</Box>
              </HStack>
            );
          })()}
          <Button
            variant={'whiteBase'}
            leftIcon={<Icon name="common/setting" w="1rem" />}
            onClick={() => {
              onOpenContact();
            }}
          >
            {t('common:common.Setting')}
          </Button>
        </HStack>
      </ModalBody>

      <ModalFooter>
        {!!defaultData.id ? (
          <>
            <Box flex={1} />
            <Button variant={'whiteBase'} mr={3} onClick={onClose}>
              {t('common:common.Close')}
            </Button>
            <Button isLoading={updating} onClick={handleSubmit((data) => onclickUpdate(data))}>
              {t('common:common.Confirm Update')}
            </Button>
          </>
        ) : (
          <Button
            w={'100%'}
            isLoading={creating}
            onClick={handleSubmit((data) => onclickCreate(data))}
          >
            {t('common:common.Confirm Create')}
          </Button>
        )}
      </ModalFooter>
      <File
        onSelect={(e) =>
          onSelectImage(e, {
            maxH: 300,
            maxW: 300,
            callback: (e) => setValue('avatar', e)
          })
        }
      />
      {isOpenContact && (
        <UpdateContact
          onClose={() => {
            onCloseContact();
          }}
          mode="notification_account"
        />
      )}
    </MyModal>
  );
}

export default React.memo(EditModal);
