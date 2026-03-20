import { prisma } from '../../shared/lib/prisma';
import { getFeatureStateRecord, isFeatureEnabled, taskTypeFeatureMap } from '../../shared/lib/features';
import { toIsoString } from '../../shared/lib/service-utils';
import { getLearningReport } from '../learning/learning.service';
import { getTimeAttendanceReport } from '../time-attendance/time-attendance.service';

function addUtcDays(date: Date, offset: number) {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + offset,
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  ));
}

export async function getOperationalReports() {
  const now = new Date();
  const nextThirtyDays = addUtcDays(now, 30);
  const ninetyDaysAgo = addUtcDays(now, -90);
  const featureStates = await getFeatureStateRecord();
  const timeOffRequestsEnabled = isFeatureEnabled(featureStates, 'time_off_requests');
  const planningManagementEnabled = isFeatureEnabled(featureStates, 'planning_management');
  const learningManagementEnabled = isFeatureEnabled(featureStates, 'learning_management');
  const timeAttendanceManagementEnabled = isFeatureEnabled(featureStates, 'time_attendance_management');
  const recruitmentManagementEnabled = isFeatureEnabled(featureStates, 'recruitment_management');
  const disabledTaskTypes = Object.entries(taskTypeFeatureMap)
    .filter(([, featureKey]) => featureKey && !isFeatureEnabled(featureStates, featureKey))
    .map(([taskType]) => taskType);

  const [
    orgUnits,
    positions,
    pendingApprovalCount,
    workflowTasks,
    leaveRequests,
    checklists,
    documents,
    employees,
    performanceCycles,
    performanceReviews,
    performanceGoals,
    recruitmentRequests,
    learning,
    timeAttendance,
  ] = await Promise.all([
    prisma.orgUnit.findMany({
      where: { recordStatus: 'Active' },
      orderBy: [{ name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        positions: {
          where: { recordStatus: 'Active' },
          select: {
            id: true,
            headcount: true,
            employees: {
              where: { status: { not: 'Terminated' } },
              select: { id: true },
            },
          },
        },
      },
    }),
    prisma.position.findMany({
      where: { recordStatus: 'Active' },
      orderBy: [{ title: 'asc' }],
      select: {
        id: true,
        positionCode: true,
        title: true,
        headcount: true,
        orgUnit: {
          select: { id: true, name: true, code: true },
        },
        employees: {
          where: { status: { not: 'Terminated' } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    timeOffRequestsEnabled
      ? prisma.leaveRequest.count({
        where: { status: 'Pending' },
      })
      : Promise.resolve(0),
    prisma.workflowTask.findMany({
      where: {
        status: 'Open',
        ...(disabledTaskTypes.length > 0 ? { taskType: { notIn: disabledTaskTypes } } : {}),
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        taskType: true,
        title: true,
        dueDate: true,
        ownerLabel: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
    timeOffRequestsEnabled
      ? prisma.leaveRequest.findMany({
        where: {
          startDate: { gte: now, lte: nextThirtyDays },
          status: 'Approved',
        },
        orderBy: [{ startDate: 'asc' }],
        select: {
          id: true,
          startDate: true,
          endDate: true,
          requestedHours: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          leaveType: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    prisma.employeeChecklist.findMany({
      where: {
        status: { not: 'Completed' },
      },
      orderBy: [{ dueDate: 'asc' }],
      select: {
        id: true,
        title: true,
        lifecycleType: true,
        status: true,
        dueDate: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        items: {
          where: { status: { not: 'Completed' } },
          select: {
            id: true,
            title: true,
            ownerLabel: true,
            dueDate: true,
            status: true,
          },
        },
      },
    }),
    prisma.employeeDocument.findMany({
      where: {
        OR: [
          { status: 'Pending Acknowledgment' },
          { status: 'Expired' },
          { expiryDate: { gte: now, lte: nextThirtyDays } },
        ],
      },
      orderBy: [{ expiryDate: 'asc' }, { updatedAt: 'desc' }],
      select: {
        id: true,
        title: true,
        status: true,
        expiryDate: true,
        employee: {
          select: {
            id: true,
            employeeNumber: true,
            firstName: true,
            lastName: true,
            department: true,
          },
        },
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        acknowledgments: {
          where: { status: 'Pending' },
          select: { id: true },
        },
      },
    }),
    prisma.employee.findMany({
      orderBy: [{ hireDate: 'desc' }],
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        department: true,
        hireDate: true,
        terminationDate: true,
        status: true,
      },
    }),
    planningManagementEnabled
      ? prisma.performanceCycle.findMany({
        orderBy: [{ startDate: 'desc' }],
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      })
      : Promise.resolve([]),
    planningManagementEnabled
      ? prisma.performanceReview.findMany({
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          status: true,
          finalizedAt: true,
          acknowledgedAt: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          cycle: {
            select: {
              id: true,
              name: true,
              selfReviewDueDate: true,
              managerReviewDueDate: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    planningManagementEnabled
      ? prisma.performanceGoal.findMany({
        orderBy: [{ targetDate: 'asc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          title: true,
          status: true,
          targetDate: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    recruitmentManagementEnabled
      ? prisma.jobRequest.findMany({
        orderBy: [{ createdAt: 'desc' }],
        select: {
          id: true,
          requestNumber: true,
          title: true,
          status: true,
          budgetImpacting: true,
          submittedAt: true,
          approvedAt: true,
          createdAt: true,
          orgUnit: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          requestType: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          requestorEmployee: {
            select: {
              id: true,
              employeeNumber: true,
              firstName: true,
              lastName: true,
              department: true,
            },
          },
        },
      })
      : Promise.resolve([]),
    learningManagementEnabled
      ? getLearningReport()
      : Promise.resolve({
        overview: {
          providerCount: 0,
          activeAssignments: 0,
          requiredOpen: 0,
          overdue: 0,
          completionRate: 0,
          certificateRenewals: 0,
        },
        providers: [],
        assignments: [],
        records: [],
      }),
    timeAttendanceManagementEnabled
      ? getTimeAttendanceReport()
      : Promise.resolve({
        overview: {
          pendingApprovals: 0,
          openExceptions: 0,
          uncoveredShifts: 0,
          overtimeHours: 0,
        },
        timeCards: [],
        coverage: [],
        exceptions: [],
      }),
  ]);

  const headcountByOrgUnit = orgUnits.map((orgUnit) => {
    const approvedHeadcount = orgUnit.positions.reduce((total, position) => total + position.headcount, 0);
    const filledSeats = orgUnit.positions.reduce((total, position) => total + position.employees.length, 0);

    return {
      id: orgUnit.id,
      code: orgUnit.code,
      name: orgUnit.name,
      type: orgUnit.type,
      approvedHeadcount,
      filledSeats,
      openSeats: Math.max(approvedHeadcount - filledSeats, 0),
      activeEmployees: filledSeats,
    };
  });

  const staffingCoverage = positions.map((position) => ({
    id: position.id,
    positionCode: position.positionCode,
    title: position.title,
    orgUnit: position.orgUnit ? {
      id: position.orgUnit.id,
      code: position.orgUnit.code,
      name: position.orgUnit.name,
    } : null,
    approvedHeadcount: position.headcount,
    filledSeats: position.employees.length,
    openSeats: Math.max(position.headcount - position.employees.length, 0),
    incumbents: position.employees.map((employee) => ({
      id: employee.id,
      fullName: `${employee.firstName} ${employee.lastName}`,
    })),
  }));

  const newHires = employees
    .filter((employee) => employee.hireDate >= ninetyDaysAgo)
    .map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: `${employee.firstName} ${employee.lastName}`,
      department: employee.department,
      eventDate: toIsoString(employee.hireDate),
      eventType: 'Hire',
      status: employee.status,
    }));

  const terminations = employees
    .filter((employee) => employee.terminationDate && employee.terminationDate >= ninetyDaysAgo)
    .map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: `${employee.firstName} ${employee.lastName}`,
      department: employee.department,
      eventDate: toIsoString(employee.terminationDate),
      eventType: 'Termination',
      status: employee.status,
    }));

  const lifecycleStatus = checklists.map((checklist) => ({
    id: checklist.id,
    title: checklist.title,
    lifecycleType: checklist.lifecycleType,
    status: checklist.status,
    dueDate: toIsoString(checklist.dueDate),
    employee: checklist.employee ? {
      id: checklist.employee.id,
      employeeNumber: checklist.employee.employeeNumber,
      fullName: `${checklist.employee.firstName} ${checklist.employee.lastName}`,
      department: checklist.employee.department,
    } : null,
    openItems: checklist.items.length,
    overdueItems: checklist.items.filter((item) => item.dueDate && item.dueDate < now).length,
    items: checklist.items.map((item) => ({
      id: item.id,
      title: item.title,
      ownerLabel: item.ownerLabel,
      dueDate: toIsoString(item.dueDate),
      status: item.status,
    })),
  }));

  const documentCompliance = documents.map((document) => ({
    id: document.id,
    title: document.title,
    status: document.status,
    expiryDate: toIsoString(document.expiryDate),
    category: document.category?.name ?? null,
    pendingAcknowledgments: document.acknowledgments.length,
    employee: document.employee ? {
      id: document.employee.id,
      employeeNumber: document.employee.employeeNumber,
      fullName: `${document.employee.firstName} ${document.employee.lastName}`,
      department: document.employee.department,
    } : null,
  }));

  const performance = {
    activeCycleCount: performanceCycles.filter((cycle) => cycle.status === 'Published').length,
    draftCycleCount: performanceCycles.filter((cycle) => cycle.status === 'Draft').length,
    overdueSelfReviews: performanceReviews.filter((review) =>
      review.status === 'Pending Self Review'
      && review.cycle.selfReviewDueDate < now
    ).length,
    overdueManagerReviews: performanceReviews.filter((review) =>
      ['Self Review Submitted', 'Manager Review In Progress'].includes(review.status)
      && review.cycle.managerReviewDueDate < now
    ).length,
    pendingAcknowledgments: performanceReviews.filter((review) => review.status === 'Finalized').length,
    goalCompletionRate: performanceGoals.length === 0
      ? 0
      : Math.round((performanceGoals.filter((goal) => ['Completed', 'Closed'].includes(goal.status)).length / performanceGoals.length) * 100),
    reviews: performanceReviews.map((review) => ({
      id: review.id,
      employee: review.employee ? {
        id: review.employee.id,
        employeeNumber: review.employee.employeeNumber,
        fullName: `${review.employee.firstName} ${review.employee.lastName}`,
        department: review.employee.department,
      } : null,
      manager: review.manager ? `${review.manager.firstName} ${review.manager.lastName}` : null,
      cycleName: review.cycle.name,
      status: review.status,
      selfReviewDueDate: toIsoString(review.cycle.selfReviewDueDate),
      managerReviewDueDate: toIsoString(review.cycle.managerReviewDueDate),
      finalizedAt: toIsoString(review.finalizedAt),
      acknowledgedAt: toIsoString(review.acknowledgedAt),
    })),
    goals: performanceGoals.map((goal) => ({
      id: goal.id,
      title: goal.title,
      status: goal.status,
      targetDate: toIsoString(goal.targetDate),
      employee: goal.employee ? {
        id: goal.employee.id,
        employeeNumber: goal.employee.employeeNumber,
        fullName: `${goal.employee.firstName} ${goal.employee.lastName}`,
        department: goal.employee.department,
      } : null,
      manager: goal.manager ? `${goal.manager.firstName} ${goal.manager.lastName}` : null,
    })),
  };

  const recruitment = {
    openRequestCount: recruitmentRequests.filter((request) => ['Draft', 'Submitted', 'In Review', 'Needs Rework'].includes(request.status)).length,
    approvedRequestCount: recruitmentRequests.filter((request) => request.status === 'Approved').length,
    closedRequestCount: recruitmentRequests.filter((request) => request.status === 'Closed').length,
    requests: recruitmentRequests.map((request) => ({
      id: request.id,
      requestNumber: request.requestNumber,
      title: request.title,
      status: request.status,
      budgetImpacting: request.budgetImpacting,
      submittedAt: toIsoString(request.submittedAt),
      approvedAt: toIsoString(request.approvedAt),
      createdAt: toIsoString(request.createdAt),
      orgUnit: request.orgUnit ? {
        id: request.orgUnit.id,
        code: request.orgUnit.code,
        name: request.orgUnit.name,
      } : null,
      requestType: request.requestType ? {
        id: request.requestType.id,
        code: request.requestType.code,
        name: request.requestType.name,
      } : null,
      requestor: request.requestorEmployee ? {
        id: request.requestorEmployee.id,
        employeeNumber: request.requestorEmployee.employeeNumber,
        fullName: `${request.requestorEmployee.firstName} ${request.requestorEmployee.lastName}`,
        department: request.requestorEmployee.department,
      } : null,
    })),
  };

  return {
    overview: {
      currentEmployees: employees.filter((employee) => employee.status !== 'Terminated').length,
      openSeats: staffingCoverage.reduce((total, position) => total + position.openSeats, 0),
      pendingApprovals: pendingApprovalCount,
      upcomingAbsences: leaveRequests.length,
      overdueTasks: workflowTasks.filter((task) => task.dueDate && task.dueDate < now).length,
      expiringDocuments: documents.filter((document) => document.expiryDate && document.expiryDate >= now).length,
      activePerformanceCycles: performance.activeCycleCount,
      learningRenewals: learning.overview.certificateRenewals,
      pendingTimeApprovals: timeAttendance.overview.pendingApprovals,
      uncoveredShifts: timeAttendance.overview.uncoveredShifts,
      openRecruitmentRequests: recruitment.openRequestCount,
    },
    headcountByOrgUnit,
    staffingCoverage,
    peopleMovement: {
      newHiresLast90Days: newHires.length,
      terminationsLast90Days: terminations.length,
      events: [...newHires, ...terminations]
        .sort((left, right) => (right.eventDate ?? '').localeCompare(left.eventDate ?? ''))
        .slice(0, 12),
    },
    leaveSnapshot: {
      pendingApprovalCount,
      upcomingApprovedRequests: leaveRequests.length,
      requests: leaveRequests.map((leaveRequest) => ({
        id: leaveRequest.id,
        startDate: toIsoString(leaveRequest.startDate),
        endDate: toIsoString(leaveRequest.endDate),
        requestedHours: Number(leaveRequest.requestedHours),
        employee: leaveRequest.employee ? {
          id: leaveRequest.employee.id,
          employeeNumber: leaveRequest.employee.employeeNumber,
          fullName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
          department: leaveRequest.employee.department,
        } : null,
        leaveType: leaveRequest.leaveType ? {
          id: leaveRequest.leaveType.id,
          code: leaveRequest.leaveType.code,
          name: leaveRequest.leaveType.name,
        } : null,
      })),
    },
    lifecycleStatus,
    documentCompliance,
    performance,
    recruitment,
    learning,
    timeAttendance,
    workflowInbox: workflowTasks.slice(0, 12).map((task) => ({
      id: task.id,
      taskType: task.taskType,
      title: task.title,
      dueDate: toIsoString(task.dueDate),
      ownerLabel: task.ownerLabel ?? null,
      employee: task.employee ? {
        id: task.employee.id,
        fullName: `${task.employee.firstName} ${task.employee.lastName}`,
      } : null,
    })),
  };
}

export async function getLearningReports() {
  return getLearningReport();
}
