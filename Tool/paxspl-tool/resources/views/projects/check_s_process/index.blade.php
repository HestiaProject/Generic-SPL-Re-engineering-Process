@extends('projects.app')
@section('content')
<div class="row">
    <div class="col-lg-12 margin-tb">
        <div class="pull-left">
            <h2>Select a process to check the artifacts from project: {{ $project->title }}</h2>
        </div>
        <!-- <div class="pull-right">
            <a class="btn btn-success" href="{{ route('projects.technique_projects.create',$project -> id) }}">New Technique <i class="fas fa-plus"></i></a>
        </div> -->
    </div>
</div>
@if ($message = Session::get('success'))
<div class="alert alert-success">
    <p>{{ $message }}</p>
</div>
@endif

@if ($message = Session::get('error'))
<div class="alert alert-danger">
    <p>{{ $message }}</p>
</div>
@endif

@if ($errors->any())
<div class="alert alert-danger">
    There were some problems with your input.<br><br>
    <ul>
        @foreach ($errors->all() as $error)
        <li>{{ $error }}</li>
        @endforeach
    </ul>
</div>
@endif



<div class="row">
    <div class="col-xs-12 col-sm-12 col-md-12">
        @if ($project->status_user())
        <div class="alert alert-danger">
            Before continuing, all team members information must be completed!<br><br>
            <a class="collapse-item" href="{{ route('projects.teams.index', $project -> id) }}">Collect Team Information</a>
        </div>
        @elseif ($project->retriever())
        <div class="alert alert-danger">
            You Must be a feature tester to to check the artifacts!<br><br>

        </div> 
        @elseif ($project->techniques_project->count()==0)
        <div class="alert alert-danger">
            Before continuing, at least one technique must be added to the project!<br><br>
            <a class="collapse-item" href="{{ route('projects.technique_projects.index', $project -> id) }}">Add Techniques</a>
        </div>
        @elseif ($project->assemble_process->count()==0)
        <div class="alert alert-danger">
            Before continuing, at least one technique must be added to the project!<br><br>
            <a class="collapse-item" href="{{ route('projects.technique_projects.index', $project -> id) }}">Add Techniques</a>
        </div>
        @else

        <div class="pull-left">
            <h2>My Scoping Processes:</h2>
        </div>

        <div class="table-responsive">
            <table class="table table-bordered" id="dataTable" width="100%" cellspacing="100" style="width:100%">
                <tr>

                    <th>Name</th>

                    <th width="300px">Action</th>
                </tr>
                @foreach ($project->scoping_process as $execute_f_process)
                <tr>

                    <td>{{ $execute_f_process->name }}</td>
                    <td>
                        <form action="" method="POST">

                            <a class="btn btn-info " href="{{ route('projects.check_s_process.artifact.index',['project'=>$project->id, 'check_s_process'=>$execute_f_process->id]) }}">Check <i class="fas fa-check-double"></i> </a>


                        </form>
                    </td>
                </tr>
                @endforeach
            </table>
            @endif

        </div>
    </div>
</div>

@endsection